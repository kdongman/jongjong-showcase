/** Minimum LiveKit room grant for a verified Couple Booth participant. */
export function coupleBoothVideoGrant(room: string) {
  return {
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
    canPublishSources: ['camera', 'microphone'],
    roomCreate: false,
    roomAdmin: false,
    roomList: false,
    ingressAdmin: false,
    hidden: false,
  };
}
