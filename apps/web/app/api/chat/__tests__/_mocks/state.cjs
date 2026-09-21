/** @type {any} */
const S = { session:{user:{id:"u1",name:"Ana"}}, streamArgs:null, models:[], created:[], findArgs:null, existingConv:null, memoryUsage:[], touchCalls:[], touchThrows:false, touchRejects:false, learnCalls:[], learnThrows:false, learnRejects:false };
const reset=()=>{S.streamArgs=null;S.models=[];S.created=[];S.findArgs=null;S.existingConv=null;S.memoryUsage=[];S.touchCalls=[];S.touchThrows=false;S.touchRejects=false;S.learnCalls=[];S.learnThrows=false;S.learnRejects=false;S.session={user:{id:"u1",name:"Ana"}};};
module.exports={S,reset};
