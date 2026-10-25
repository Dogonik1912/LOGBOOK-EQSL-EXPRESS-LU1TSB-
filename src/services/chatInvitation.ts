export type ChatInvitationKind = 'send' | 'reply' | 'settings';

const PROMPT_KEYS: Record<Exclude<ChatInvitationKind, 'settings'>, string> = {
  send: 'logbook_chat_invite_send_prompted',
  reply: 'logbook_chat_invite_reply_prompted',
};

/** Keeps the invitation pending and displays it when an unauthenticated user reaches an eQSL action. */
export function requestChatInvitation(kind: ChatInvitationKind): void {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem('logbook_chat_authenticated') === '1') return;

  localStorage.setItem('logbook_chat_invitation_pending', '1');
  // Do not suppress the event using a persistent localStorage flag: a previous
  // attempt may have set that flag while the app was backgrounded by WhatsApp.
  // The app must be able to show the invitation again after each eQSL action.
  window.dispatchEvent(new CustomEvent('logbook-chat-invitation-open', { detail: { kind } }));
}
