# ClamAV 1.4.3 source offer

AMIC Vault consumes the unmodified official `clamav/clamav:1.4.3` image pinned
by digest in `infra/clamav.Dockerfile`. Its corresponding source is the
official `Cisco-Talos/clamav-devel` tag `clamav-1.4.3` at
`d8b053865fd5995f7af98bfbcd98c9a5644bfe2b`, available from
https://github.com/Cisco-Talos/clamav-devel/tree/clamav-1.4.3 under
GPL-2.0-only. This repository contains no ClamAV source, fixture, protocol
implementation, or image modification; the Vault adapter is independently
written and calls the documented daemon protocol.
