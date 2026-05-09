export const disputeInclude = {
  openedBy: { select: { id: true, username: true, email: true } },
  buyer: { select: { id: true, username: true, email: true, walletAddress: true } },
  seller: { select: { id: true, username: true, email: true, walletAddress: true } },
  resolvedBy: { select: { id: true, username: true, email: true } },
  evidence: {
    include: { uploadedBy: { select: { id: true, username: true, email: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
  escrowDeal: {
    include: {
      ad: { select: { id: true, title: true, price: true, currency: true, game: true, server: true, region: true } },
      conversation: {
        include: {
          messages: {
            include: { sender: { select: { id: true, username: true, email: true } } },
            orderBy: { createdAt: 'asc' as const },
            take: 80,
          },
        },
      },
      events: {
        orderBy: { createdAt: 'desc' as const },
        take: 25,
      },
    },
  },
};
