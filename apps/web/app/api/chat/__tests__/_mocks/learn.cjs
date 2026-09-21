const {S}=require("./state.cjs");
exports.learnFromMessage=(args)=>{
  S.learnCalls.push(args);
  if(S.learnThrows) throw new Error("boom síncrono");            // caso hostil: lanza antes de devolver promesa
  if(S.learnRejects) return Promise.reject(new Error("boom async")); // caso hostil: promesa rechazada
  return Promise.resolve({persisted:0,discarded:0,suppressed:0});
};
