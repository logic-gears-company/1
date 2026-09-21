const {S}=require("./state.cjs");
exports.prisma={conversation:{findFirst:async(a)=>{S.findArgs=a;return S.existingConv;},create:async(a)=>{S.created.push(a);return{id:"c-new",systemPrompt:null,messages:[]};},update:async()=>({})},message:{create:async()=>({})}};
