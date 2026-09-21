const { S } = require("./learn-store.cjs");
module.exports = { prisma: { message: { count: async () => S.msgCount } } };
