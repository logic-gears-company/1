const {S}=require("./state.cjs");
exports.loadUserContext=async()=>({text:"<axis_context>CTX</axis_context>",settings:{},memoryUsage:S.memoryUsage});
