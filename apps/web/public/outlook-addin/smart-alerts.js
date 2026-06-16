(function () {
  var SOURCE_CLIENT = 'outlook-web-addin';
  var HASH_RE = /^[0-9a-f]{64}$/;

  function completeAllow(event) {
    event.completed({ allowEvent: true });
  }

  function completeWarn(event) {
    var promptUser =
      (window.Office &&
        Office.MailboxEnums &&
        Office.MailboxEnums.SendModeOverride &&
        Office.MailboxEnums.SendModeOverride.PromptUser) ||
      'promptUser';
    event.completed({
      allowEvent: false,
      errorMessage: 'AMIC Vault recommends filing this message before sending.',
      sendModeOverride: promptUser,
    });
  }

  function completeBlock(event) {
    event.completed({
      allowEvent: false,
      errorMessage: 'AMIC Vault policy blocked this send. Open the Vault pane to resolve it.',
    });
  }

  function cleanToken(value) {
    if (typeof value !== 'string') return null;
    var trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= 2048 ? trimmed : null;
  }

  function domainFromEmail(value) {
    var token = cleanToken(value);
    if (!token || token.indexOf('@') === -1) return null;
    return token.split('@').pop().toLowerCase();
  }

  function shortHash(hash) {
    return hash && hash.length > 12 ? hash.slice(0, 8) + '.' + hash.slice(-4) : hash;
  }

  async function sha256Hex(value) {
    if (!window.crypto || !window.crypto.subtle) throw new Error('HASH_UNAVAILABLE');
    var encoded = new TextEncoder().encode(value);
    var digest = await window.crypto.subtle.digest('SHA-256', encoded);
    return Array.prototype.map
      .call(new Uint8Array(digest), function (byte) {
        return byte.toString(16).padStart(2, '0');
      })
      .join('');
  }

  function namespacedHash(namespace, value) {
    return sha256Hex(namespace + '\0' + value);
  }

  async function optionalHash(namespace, value, lower) {
    var token = cleanToken(value);
    if (!token) return undefined;
    return namespacedHash(namespace, lower ? token.toLowerCase() : token);
  }

  function getAsyncValue(holder) {
    return new Promise(function (resolve) {
      if (!holder) {
        resolve(undefined);
        return;
      }
      if (typeof holder.getAsync === 'function') {
        holder.getAsync(function (result) {
          if (result && result.status === Office.AsyncResultStatus.Succeeded) {
            resolve(result.value);
          } else {
            resolve(undefined);
          }
        });
        return;
      }
      resolve(holder);
    });
  }

  function getAttachments(item) {
    return new Promise(function (resolve) {
      if (!item) {
        resolve([]);
        return;
      }
      if (typeof item.getAttachmentsAsync === 'function') {
        item.getAttachmentsAsync(function (result) {
          if (result && result.status === Office.AsyncResultStatus.Succeeded) {
            resolve(Array.isArray(result.value) ? result.value : []);
          } else {
            resolve([]);
          }
        });
        return;
      }
      resolve(Array.isArray(item.attachments) ? item.attachments : []);
    });
  }

  function recipientEmails(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map(function (entry) {
        return cleanToken(entry && (entry.emailAddress || entry.displayName));
      })
      .filter(Boolean);
  }

  async function buildAttachmentRefs(attachments) {
    var refs = [];
    for (var index = 0; index < attachments.length && index < 200; index += 1) {
      var attachment = attachments[index] || {};
      var token =
        cleanToken(attachment.id) ||
        'ordinal:' +
          index +
          ':size:' +
          String(Math.max(0, Number(attachment.size || 0))) +
          ':mime:' +
          String(cleanToken(attachment.contentType) || '');
      var contentIdHash = await optionalHash('attachment-content-id', attachment.contentId, false);
      refs.push({
        attachmentIdHash: await namespacedHash('attachment-id', token),
        ...(contentIdHash && HASH_RE.test(contentIdHash) ? { contentIdHash: contentIdHash } : {}),
        ordinal: index,
        sizeBytes: Math.max(0, Math.min(2147483647, Number(attachment.size || 0))),
        ...(cleanToken(attachment.contentType) ? { mimeType: cleanToken(attachment.contentType) } : {}),
        selectedForFiling: attachment.isInline !== true,
      });
    }
    return refs;
  }

  async function buildPolicyPayload() {
    var mailbox = Office.context && Office.context.mailbox;
    var item = mailbox && mailbox.item;
    var mailboxEmail = cleanToken(mailbox && mailbox.userProfile && mailbox.userProfile.emailAddress);
    if (!mailboxEmail || !item) throw new Error('OUTLOOK_ITEM_UNAVAILABLE');

    var to = recipientEmails(await getAsyncValue(item.to));
    var cc = recipientEmails(await getAsyncValue(item.cc));
    var subject = await getAsyncValue(item.subject);
    var itemToken =
      cleanToken(item.itemId) ||
      cleanToken(item.internetMessageId) ||
      'compose:' + Date.now().toString(36);
    var mailboxDomain = domainFromEmail(mailboxEmail);
    var participantDomains = to
      .concat(cc)
      .map(domainFromEmail)
      .filter(Boolean)
      .slice(0, 50);
    var participantDomainHashes = (
      await Promise.all(
        participantDomains.map(function (domain) {
          return namespacedHash('domain', domain);
        }),
      )
    ).sort();
    var attachments = await getAttachments(item);
    var attachmentRefs = await buildAttachmentRefs(attachments);
    var mailboxFingerprint = await namespacedHash('mailbox', mailboxEmail);
    var outlookItemIdHash = await namespacedHash('outlook-item-id', itemToken);
    var conversationIdHash = await optionalHash('conversation-id', item.conversationId, false);
    var subjectHash = await optionalHash('subject', subject, true);
    var externalCount = participantDomains.filter(function (domain) {
      return mailboxDomain && domain !== mailboxDomain;
    }).length;
    var canonicalMessageSha256 = await sha256Hex(
      JSON.stringify({
        attachmentRefs: attachmentRefs,
        conversationIdHash: conversationIdHash || null,
        mailboxFingerprint: mailboxFingerprint,
        outlookItemIdHash: outlookItemIdHash,
        participantDomainHashes: participantDomainHashes,
      }),
    );

    return {
      sourceClient: SOURCE_CLIENT,
      message: {
        mailboxFingerprint: mailboxFingerprint,
        outlookItemIdHash: outlookItemIdHash,
        ...(conversationIdHash && HASH_RE.test(conversationIdHash)
          ? { conversationIdHash: conversationIdHash }
          : {}),
        canonicalMessageSha256: canonicalMessageSha256,
        hasExternalParticipants: externalCount > 0,
        participantDomainHashes: participantDomainHashes,
      },
      attachments: attachmentRefs,
      ...(subjectHash && HASH_RE.test(subjectHash) ? { subjectHash: subjectHash } : {}),
      clientRequestId: 'oa07evt:' + Date.now().toString(36) + ':' + shortHash(outlookItemIdHash),
    };
  }

  async function postPolicy(payload) {
    var response = await fetch(new URL('/v1/m365/outlook/send-policy-decisions', location.origin).toString(), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('POLICY_UNAVAILABLE');
    return response.json();
  }

  async function onAmicVaultMessageSend(event) {
    try {
      var payload = await buildPolicyPayload();
      var policy = await postPolicy(payload);
      if (policy && policy.decision === 'block') {
        completeBlock(event);
        return;
      }
      if (policy && policy.decision === 'warn') {
        completeWarn(event);
        return;
      }
      completeAllow(event);
    } catch (_error) {
      completeAllow(event);
    }
  }

  window.onAmicVaultMessageSend = onAmicVaultMessageSend;
  if (window.Office && Office.actions && typeof Office.actions.associate === 'function') {
    Office.actions.associate('onAmicVaultMessageSend', onAmicVaultMessageSend);
  }
})();
