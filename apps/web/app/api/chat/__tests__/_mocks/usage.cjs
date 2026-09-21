const {S}=require("./state.cjs");
exports.touchMemoriesUsed=(userId,used)=>{
  S.touchCalls.push({userId,used});
  if(S.touchThrows) throw new Error("boom síncrono");           // caso hostil: lanza antes de devolver promesa
  if(S.touchRejects) return Promise.reject(new Error("boom async")); // caso hostil: promesa rechazada
  return Promise.resolve(0);
};
