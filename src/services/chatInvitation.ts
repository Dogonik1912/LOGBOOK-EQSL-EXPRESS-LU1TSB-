export type ChatInvitationKind = 'send' | 'reply' | 'settings';

const PROMPT_KEYS: Record<Exclude<ChatInvitationKind, 'settings'>, string> = {
  send: 'logbook_chat_invite_send_prompted',
  reply: 'logbook_chat_invite_reply_prompted',
};

/** Stores a deferred invitation locally and requests the one-time prompt after the first share attempt. */
export function requestChatInvitation(kind: ChatInvitationKind): void {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('logbook_chat_authenticated') === '1') return;

  localStorage.setItem('logbook_chat_invitation_pending', '1');
  if (kind === 'settings') {
    window.dispatchEvent(new CustomEvent('logbook-chat-invitation-open', { detail: { kind } }));
    return;
  }

  const key = PROMPT_KEYS[kind];
  if (localStorage.getItem(key) === '1') return;
  localStorage.setItem(key, '1');
  window.dispatchEvent(new CustomEvent('logbook-chat-invitation-open', { detail: { kind } }));
}
