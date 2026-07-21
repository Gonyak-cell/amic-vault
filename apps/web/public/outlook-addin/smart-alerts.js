(function () {
  var SOURCE_CLIENT = 'outlook-web-addin';
  var HASH_RE = /^[0-9a-f]{64}$/;
  var MAX_DLP_FINDINGS = 20;
  var MAX_DLP_SCAN_CHARS = 200000;
  var CONTEXT_RADIUS = 24;
  var RESTRICTED_DLP_FINDING_TYPES = {
    korean_resident_id: true,
    korean_alien_registration_number: true,
    payment_card_number: true,
    passport_number: true,
  };
  var DLP_RULES = [
    {
      ruleId: 'kr-rrn-format-v1',
      findingType: 'korean_resident_id',
      pattern: /\b\d{6}[- ]?[0-4]\d{6}\b/gu,
      confidence: 0.95,
      normalize: digitsOnly,
    },
    {
      ruleId: 'kr-alien-registration-format-v1',
      findingType: 'korean_alien_registration_number',
      pattern: /\b\d{6}[- ]?[5-8]\d{6}\b/gu,
      confidence: 0.95,
      normalize: digitsOnly,
    },
    {
      ruleId: 'bank-account-format-v1',
      findingType: 'bank_account',
      pattern: /\b(?!01[016789][- ])\d{2,6}[- ]\d{2,8}[- ]\d{1,6}(?:[- ]\d{1,4})?\b/gu,
      confidence: 0.8,
      normalize: digitsOnly,
    },
    {
      ruleId: 'passport-format-v1',
      findingType: 'passport_number',
      pattern: /\b[A-Z][0-9]{8}\b/gu,
      confidence: 0.8,
      normalize: lower,
    },
    {
      ruleId: 'payment-card-format-v1',
      findingType: 'payment_card_number',
      pattern: /\b(?:\d[ -]?){13,19}\b/gu,
      confidence: 0.85,
      normalize: digitsOnly,
      validate: luhnValid,
    },
    {
      ruleId: 'email-address-format-v1',
      findingType: 'email_address',
      pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
      confidence: 0.9,
      normalize: lower,
    },
    {
      ruleId: 'kr-phone-format-v1',
      findingType: 'phone_number',
      pattern: /\b(?:\+82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}\b/gu,
      confidence: 0.85,
      normalize: digitsOnly,
    },
  ];

  function completeAllow(event) {
    event.completed({ allowEvent: true });
  }

  function warningMessage(policy) {
    var codes = policy && Array.isArray(policy.warningReasonCodes) ? policy.warningReasonCodes : [];
    if (codes.indexOf('dlp_finding') !== -1) {
      return 'AMIC Vault detected sensitive data. Review the message before sending.';
    }
    if (codes.indexOf('dlp_scan_failed') !== -1) {
      return 'AMIC Vault could not finish the local DLP scan. Review the message before sending.';
    }
    return 'AMIC Vault recommends filing this message before sending.';
  }

  function completeWarn(event, policy) {
    var promptUser =
      (window.Office &&
        Office.MailboxEnums &&
        Office.MailboxEnums.SendModeOverride &&
        Office.MailboxEnums.SendModeOverride.PromptUser) ||
      'promptUser';
    event.completed({
      allowEvent: false,
      errorMessage: warningMessage(policy),
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

  function digitsOnly(input) {
    return String(input).replace(/\D/gu, '');
  }

  function lower(input) {
    return String(input).toLowerCase();
  }

  function luhnValid(digits) {
    var sum = 0;
    var doubleDigit = false;
    for (var index = digits.length - 1; index >= 0; index -= 1) {
      var value = Number(digits[index]);
      if (doubleDigit) {
        value *= 2;
        if (value > 9) value -= 9;
      }
      sum += value;
      doubleDigit = !doubleDigit;
    }
    return sum > 0 && sum % 10 === 0;
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

  function getBodyText(item) {
    return new Promise(function (resolve) {
      if (!item || !item.body || typeof item.body.getAsync !== 'function') {
        resolve({ ok: false, failureCode: 'body_unavailable' });
        return;
      }
      var textCoercion =
        (window.Office && Office.CoercionType && Office.CoercionType.Text) || 'text';
      item.body.getAsync(textCoercion, function (result) {
        if (result && result.status === Office.AsyncResultStatus.Succeeded) {
          resolve({ ok: true, value: String(result.value || '') });
        } else {
          resolve({ ok: false, failureCode: 'body_unavailable' });
        }
      });
    });
  }

  function getAttachmentContent(item, attachment) {
    return new Promise(function (resolve) {
      var attachmentId = cleanToken(attachment && attachment.id);
      if (!attachmentId || !item || typeof item.getAttachmentContentAsync !== 'function') {
        resolve(null);
        return;
      }
      item.getAttachmentContentAsync(attachmentId, function (result) {
        if (result && result.status === Office.AsyncResultStatus.Succeeded) {
          var value = result.value || {};
          resolve(cleanToken(value.content) || null);
        } else {
          resolve(null);
        }
      });
    });
  }

  async function attachmentTextCandidates(item, attachments) {
    var texts = [];
    for (var index = 0; index < attachments.length && index < 20; index += 1) {
      var attachment = attachments[index] || {};
      var inlineText =
        cleanToken(attachment.text) ||
        cleanToken(attachment.content) ||
        cleanToken(attachment.body);
      var content = inlineText || (await getAttachmentContent(item, attachment));
      if (content) texts.push(content);
    }
    return texts;
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

  async function scanTextForDlp(text) {
    var bounded = String(text || '').slice(0, MAX_DLP_SCAN_CHARS);
    var findings = [];
    var seen = {};
    for (var ruleIndex = 0; ruleIndex < DLP_RULES.length; ruleIndex += 1) {
      var rule = DLP_RULES[ruleIndex];
      rule.pattern.lastIndex = 0;
      var match;
      while ((match = rule.pattern.exec(bounded)) !== null) {
        var raw = match[0];
        var normalized = rule.normalize(raw);
        if (!normalized || (rule.validate && !rule.validate(normalized))) continue;
        var startOffset = match.index;
        var endOffset = startOffset + raw.length;
        var valueHash = await sha256Hex(rule.ruleId + ':' + normalized);
        var key = rule.ruleId + ':' + startOffset + ':' + endOffset + ':' + valueHash;
        if (seen[key]) continue;
        seen[key] = true;
        findings.push({
          ruleId: rule.ruleId,
          findingType: rule.findingType,
          valueHash: valueHash,
          evidenceHash: await sha256Hex(
            bounded.slice(
              Math.max(0, startOffset - CONTEXT_RADIUS),
              Math.min(bounded.length, endOffset + CONTEXT_RADIUS),
            ),
          ),
          confidence: rule.confidence,
        });
        if (findings.length >= MAX_DLP_FINDINGS) return findings;
      }
    }
    return findings;
  }

  async function buildDlpReport(item, attachments) {
    try {
      var body = await getBodyText(item);
      if (!body.ok) {
        return {
          status: 'scan_failed',
          failureCode: body.failureCode || 'body_unavailable',
        };
      }
      var findings = await scanTextForDlp(body.value);
      var attachmentTexts = await attachmentTextCandidates(item, attachments);
      for (var index = 0; index < attachmentTexts.length && findings.length < MAX_DLP_FINDINGS; index += 1) {
        findings = findings.concat(await scanTextForDlp(attachmentTexts[index]));
        findings = findings.slice(0, MAX_DLP_FINDINGS);
      }
      if (findings.length === 0) {
        return {
          status: 'clean',
          findingCount: 0,
          restrictedFindingCount: 0,
          findingRefs: [],
        };
      }
      return {
        status: 'finding',
        findingCount: findings.length,
        restrictedFindingCount: findings.filter(function (finding) {
          return RESTRICTED_DLP_FINDING_TYPES[finding.findingType] === true;
        }).length,
        findingRefs: findings,
      };
    } catch (error) {
      return {
        status: 'scan_failed',
        failureCode: error && error.message === 'HASH_UNAVAILABLE' ? 'hash_unavailable' : 'unexpected_error',
      };
    }
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
    var dlpReport = await buildDlpReport(item, attachments);
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
      dlpReport: dlpReport,
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
        completeWarn(event, policy);
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
