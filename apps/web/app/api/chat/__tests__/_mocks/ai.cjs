const {S}=require("./state.cjs");
exports.smoothStream=()=>({}); exports.generateText=async()=>({text:"{}"});
exports.streamText=(o)=>{S.streamArgs=o;return{toUIMessageStreamResponse:(x)=>({ok:true,headers:x&&x.headers})};};
