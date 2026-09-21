const {S}=require("./state.cjs");
const mk=(p)=>(m)=>{S.models.push({p,m});return{p,m};};
exports.getGroqModel=mk("groq");exports.getOpenRouterModel=mk("openrouter");exports.getAnthropicModel=mk("anthropic");exports.getOpenAIModel=mk("openai");
