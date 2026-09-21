import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PERSONA_BLOCKS, buildPersonaPrompt } from "../persona";
import { SERVER_BASE_SYSTEM_PROMPT, resolveSystemPrompt } from "../chat-policy";

const prompt = buildPersonaPrompt();
const block = (id: string) => {
  const b = PERSONA_BLOCKS.find((x) => x.id === id);
  assert.ok(b, `falta el bloque "${id}"`);
  return b.text;
};

describe("persona: estructura", () => {
  it("tiene los 8 bloques esperados, en orden, sin ids repetidos", () => {
    assert.deepEqual(
      PERSONA_BLOCKS.map((b) => b.id),
      ["identity", "style", "honesty", "adaptation", "emotion", "memory_use", "time", "scope"],
    );
    assert.equal(new Set(PERSONA_BLOCKS.map((b) => b.id)).size, PERSONA_BLOCKS.length);
  });

  it("ningún bloque está vacío y todos están en el prompt final", () => {
    for (const b of PERSONA_BLOCKS) {
      assert.ok(b.text.trim().length > 40, `bloque "${b.id}" demasiado corto`);
      assert.ok(prompt.includes(b.text), `el bloque "${b.id}" no llegó al prompt`);
    }
  });

  it("es determinista (no depende de la petición ni del reloj)", () => {
    assert.equal(buildPersonaPrompt(), buildPersonaPrompt());
  });

  it("es compacto: cada llamada al chat lo paga en tokens", () => {
    // ~4 caracteres/token. Techo de ~700 tokens para no inflar cada petición.
    assert.ok(prompt.length < 2800, `prompt de ${prompt.length} caracteres: demasiado largo`);
  });

  it("está en español y no menciona a ningún proveedor de modelo", () => {
    assert.match(prompt, /Eres AXIS/);
    for (const banned of [/openai/i, /anthropic/i, /groq/i, /\bgpt/i, /\bclaude\b/i]) {
      assert.doesNotMatch(prompt, banned, `no debe nombrar al proveedor: ${banned}`);
    }
  });
});

describe("persona: invariantes de comportamiento (README §1, §4, §11.1)", () => {
  it("identidad: lema y tono de amigo, no de chatbot genérico", () => {
    const t = block("identity");
    assert.match(t, /Be Human/);
    assert.match(t, /amigo/);
  });

  it("emoción: prohíbe diagnosticar y psicologizar, y trata el ánimo como contexto", () => {
    const t = block("emotion");
    assert.match(t, /nunca (?:como )?un diagnóstico/i);
    assert.match(t, /Jamás afirmes/i);
    assert.match(t, /psicología/i);
    assert.match(t, /empalagoso/i);
    assert.match(t, /crisis/i);
    assert.match(t, /apoyo humano/i);
  });

  it("emoción: da instrucciones concretas para el estrés (simplificar, priorizar)", () => {
    const t = block("emotion");
    assert.match(t, /reduce la complejidad/i);
    assert.match(t, /prioriza/i);
  });

  it("memoria: lo declarado es hecho, lo inferido es suposición, y no se recita", () => {
    const t = block("memory_use");
    assert.match(t, /inferido/i);
    assert.match(t, /suposición/i);
    assert.match(t, /no lo recites|No lo recites/);
    assert.match(t, /olvide/i);
  });

  it("adaptación: lo dicho ahora manda sobre lo guardado", () => {
    assert.match(block("adaptation"), /mensaje actual manda/i);
  });

  it("estilo: rechaza las muletillas de asistente y el cierre ofreciendo ayuda", () => {
    const t = block("style");
    assert.match(t, /muletillas/i);
    assert.match(t, /No termines cada mensaje/i);
  });

  it("sinceridad: admitir ignorancia y no inventar datos", () => {
    const t = block("honesty");
    assert.match(t, /si no sabes algo, dilo/i);
    assert.match(t, /No inventes/i);
  });

  it("alcance: no finge capacidades que no tiene (internet/archivos/ejecución)", () => {
    const t = block("scope");
    assert.match(t, /No tienes acceso a internet/i);
    assert.match(t, /no afirmes haber buscado/i);
  });

  it("alcance: Complexity se menciona una vez, sin presionar, y sin vender", () => {
    const t = block("scope");
    assert.match(t, /Complexity/);
    assert.match(t, /sin presionar/i);
    assert.doesNotMatch(prompt, /compra|suscr[ií]be|precio|premium|plan de pago/i);
  });

  it("hora: no saluda con la hora equivocada", () => {
    assert.match(block("time"), /buenos días/i);
  });
});

describe("persona: NO contiene lo que AXIS descarta", () => {
  // Las fórmulas empalagosas o de diagnóstico solo pueden aparecer para PROHIBIRLAS.
  // Se comprueba que, cuando aparecen, están dentro de un contexto de prohibición.
  it("«estoy aquí para ti» solo figura como ejemplo a evitar", () => {
    const hits = prompt.match(/estoy aquí para ti/gi) ?? [];
    assert.ok(hits.length <= 1);
    if (hits.length === 1) assert.match(prompt, /nada de «estoy aquí para ti»/i);
  });

  it("«tiene ansiedad» solo figura entre comillas, precedido de una prohibición", () => {
    if (/tiene/.test(prompt) && /ansiedad/.test(prompt)) {
      assert.match(prompt, /Jamás afirmes que alguien\s+«tiene» ansiedad/i);
    }
  });

  it("no promete cosas imposibles", () => {
    for (const promise of [/recuerdo todo/i, /nunca me equivoco/i, /puedo navegar/i, /tengo acceso a internet/i]) {
      assert.doesNotMatch(prompt, promise);
    }
  });

  it("no contiene marcadores de plantilla sin rellenar ni etiquetas que confundan al contexto", () => {
    assert.doesNotMatch(prompt, /\{\{|\}\}|TODO|FIXME|\$\{/);
    // <axis_context> es propiedad de context-format.ts; la persona no debe abrirlo ni cerrarlo.
    assert.doesNotMatch(prompt, /<\/?axis_context>/i);
  });
});

describe("persona ↔ chat-policy", () => {
  it("SERVER_BASE_SYSTEM_PROMPT es exactamente la persona", () => {
    assert.equal(SERVER_BASE_SYSTEM_PROMPT, prompt);
  });

  it("resolveSystemPrompt() devuelve la persona (y sigue sin aceptar parámetros)", () => {
    assert.equal(resolveSystemPrompt(), prompt);
    assert.equal(resolveSystemPrompt.length, 0);
  });
});
