class NextRequest { constructor(b) { this._b = b; } async json() { if (this._b === "__THROW__") throw new Error("bad json"); return this._b; } }
exports.NextRequest = NextRequest;
exports.NextResponse = { json: (b, i) => ({ body: b, status: (i && i.status) || 200 }) };
