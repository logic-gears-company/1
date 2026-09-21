const mk=(check,def,opt)=>({_c:check,_d:def,_o:opt,optional(){return mk(check,def,true);},default(d){return mk(check,d,true);},
 min(n){return mk(v=>check(v)&&(typeof v==="string"?v.length>=n:v>=n),def,opt);},max(n){return mk(v=>check(v)&&(typeof v==="string"?v.length<=n:v<=n),def,opt);}});
exports.z={string:()=>mk(v=>typeof v==="string"),number:()=>mk(v=>typeof v==="number"),enum:(a)=>mk(v=>a.includes(v)),
 object:(shape)=>({safeParse:(b)=>{const out={};for(const k in shape){const f=shape[k];let v=b&&b[k];
 if(v===undefined){if(f._d!==undefined)v=f._d;else if(f._o)continue;else return{success:false,error:{flatten:()=>({})}};}
 if(!f._c(v))return{success:false,error:{flatten:()=>({})}};out[k]=v;}return{success:true,data:out};}})};
