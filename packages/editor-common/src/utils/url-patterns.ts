/**
 * Regular expression patterns for URL and email validation.
 */

/**
 * Email pattern (basic).
 * Matches: user@domain.com, mailto:user@domain.com
 */
export const EMAIL_RE =
  /^(mailto:)?([a-z0-9'\._-]+@[a-z0-9\.-]+\.[a-z0-9]{2,4})([a-яё0-9\._%+-=\? :&]*)/i

/**
 * IP address pattern with optional protocol.
 * Matches: http://192.168.1.1, 192.168.1.1
 */
export const IP_RE =
  /^(((https?)|(ftps?)):\/\/)?([\-\wа-яё]*:?[\-\wа-яё]*@)?(((1[0-9]{2}|2[0-4][0-9]|25[0-5]|[1-9][0-9]|[0-9])\.){3}(1[0-9]{2}|2[0-4][0-9]|25[0-5]|[1-9][0-9]|[0-9]))(:\d+)?(\/[%\-\wа-яё]*(\.[\wа-яё]{2,})?(([\wа-яё\-\.\?\\\/+@&#;:`~=%!,\(\)]*)(\.[\wа-яё]{2,})?)*)*\/?/i

/**
 * Hostname pattern with optional protocol.
 * Matches: http://example.com, example.com, www.example.com
 */
export const HOSTNAME_RE =
  /^(((https?)|(ftps?)):\/\/)?([\-\wа-яё]*:?[\-\wа-яё]*@)?(([\-\wа-яё]+\.)+[\wа-яё\-]{2,}(:\d+)?(\/[%\-\wа-яё]*(\.[\wа-яё]{2,})?(([\wа-яё\-\.\?\\\/\+@&#;:`'~=%!,\(\)]*)(\.[\wа-яё]{2,})?)*)*\/?)/i

/**
 * Local URL pattern (requires protocol).
 * Matches: http://localhost, http://192.168.1.1
 */
export const LOCAL_RE =
  /^(((https?)|(ftps?)):\/\/)([\-\wа-яё]*:?[\-\wа-яё]*@)?(([\-\wа-яё]+)(:\d+)?(\/[%\-\wа-яё]*(\.[\wа-яё]{2,})?(([\wа-яё\-\.\?\\\/\+@&#;:`'~=%!,\(\)]*)(\.[\wа-яё]{2,})?)*)*\/?)/i

/**
 * Strong email pattern (with additional parameters).
 * Matches: user@domain.com?param=value, mailto:user@domain.com?param=value
 */
export const EMAIL_STRONG_RE =
  /(mailto:)?([a-z0-9'\.\+_-]+@[a-z0-9\.-]+\.[a-z0-9]{2,4})([a-яё0-9\._%\+-=\?:&]*)/gi

/**
 * Email pattern with optional prefix (for additional matching).
 * Matches: user@domain.com, @user@domain.com, +user@domain.com
 */
export const EMAIL_ADD_STRONG_RE =
  /(mailto:|\s[@]|\s[+])?([a-z0-9'\._-]+@[a-z0-9\.-]+\.[a-z0-9]{2,4})([a-яё0-9\._%\+-=\?:&]*)/gi

/**
 * Strong IP address pattern (global).
 * Matches: http://192.168.1.1, 192.168.1.1
 */
export const IP_STRONG_RE =
  /(((https?)|(ftps?)):\/\/([\-\wа-яё]*:?[\-\wа-яё]*@)?)(((1[0-9]{2}|2[0-4][0-9]|25[0-5]|[1-9][0-9]|[0-9])\.){3}(1[0-9]{2}|2[0-4][0-9]|25[0-5]|[1-9][0-9]|[0-9]))(:\d+)?(\/[%\-\wа-яё]*(\.[\wа-яё]{2,})?(([\wа-яё\-\.\?\\\/\+@&#;:`~=%!,\(\)]*)(\.[\wа-яё]{2,})?)*)*\/?/gi

/**
 * Strong hostname pattern (with www support).
 * Matches: http://example.com, www.example.com, example.com
 */
export const HOSTNAME_STRONG_RE =
  /((((https?)|(ftps?)):\/\/([\-\wа-яё]*:?[\-\wа-яё]*@)?)|(([\-\wа-яё]*:?[\-\wа-яё]*@)?www\.))((([\-\wа-яё]+\.)+[\wа-яё\-]{2,}|([\-\wа-яё]+))(:\d+)?(\/[%\-\wа-яё]*(\.[\wа-яё]{2,})?(([\wа-яё\-\.\?\\\/\+@&#;:`~=%!,\(\)]*)(\.[\wа-яё]{2,})?)*)*\/?)/gi

/**
 * URL pattern (basic).
 * Matches: http://example.com/path, https://example.com:8080/path?query=value
 */
export const URL_RE =
  /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)*$/

/**
 * Domain pattern (simple).
 * Matches: example.com, subdomain.example.com
 */
export const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
