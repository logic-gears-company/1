class NextRequest{constructor(b){this._b=b;} async json(){return this._b;}}
exports.NextRequest=NextRequest; exports.NextResponse={json:(b,i)=>({body:b,status:i?.status??200})};
