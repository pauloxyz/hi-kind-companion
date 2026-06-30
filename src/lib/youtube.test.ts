import { describe, expect, it } from "vitest";
import { normalizeYouTubeUrl, parseYouTubeId } from "./youtube";

describe("parseYouTubeId", () => {
  const ID = "dQw4w9WgXcQ";

  it("aceita URL curta youtu.be", () => {
    expect(parseYouTubeId(`https://youtu.be/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://youtu.be/${ID}?t=10`)).toBe(ID);
  });

  it("aceita watch?v=", () => {
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://youtube.com/watch?v=${ID}&feature=share`)).toBe(ID);
    expect(parseYouTubeId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it("aceita /shorts/", () => {
    expect(parseYouTubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://youtube.com/shorts/${ID}?si=abc`)).toBe(ID);
  });

  it("aceita /embed/", () => {
    expect(parseYouTubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube-nocookie.com/embed/${ID}`)).toBe(ID);
  });

  it("aceita /v/ e /live/", () => {
    expect(parseYouTubeId(`https://www.youtube.com/v/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube.com/live/${ID}`)).toBe(ID);
  });

  it("tolera ausência de protocolo", () => {
    expect(parseYouTubeId(`youtu.be/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`www.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it("aceita ID puro colado isolado", () => {
    expect(parseYouTubeId(ID)).toBe(ID);
  });

  it("retorna null para entradas inválidas", () => {
    expect(parseYouTubeId(null)).toBeNull();
    expect(parseYouTubeId(undefined)).toBeNull();
    expect(parseYouTubeId("")).toBeNull();
    expect(parseYouTubeId("   ")).toBeNull();
    expect(parseYouTubeId("https://vimeo.com/123456")).toBeNull();
    expect(parseYouTubeId("https://example.com/watch?v=abc")).toBeNull();
    expect(parseYouTubeId("not a url")).toBeNull();
    expect(parseYouTubeId("https://youtube.com/")).toBeNull();
    expect(parseYouTubeId("https://youtu.be/")).toBeNull();
  });
});

describe("normalizeYouTubeUrl", () => {
  const ID = "dQw4w9WgXcQ";

  it("converte qualquer formato válido para a forma canônica youtu.be", () => {
    expect(normalizeYouTubeUrl(`https://www.youtube.com/watch?v=${ID}`)).toBe(`https://youtu.be/${ID}`);
    expect(normalizeYouTubeUrl(`https://www.youtube.com/shorts/${ID}`)).toBe(`https://youtu.be/${ID}`);
    expect(normalizeYouTubeUrl(`https://youtube-nocookie.com/embed/${ID}`)).toBe(`https://youtu.be/${ID}`);
    expect(normalizeYouTubeUrl(ID)).toBe(`https://youtu.be/${ID}`);
  });

  it("retorna null para URL inválida", () => {
    expect(normalizeYouTubeUrl("https://vimeo.com/123")).toBeNull();
    expect(normalizeYouTubeUrl("")).toBeNull();
    expect(normalizeYouTubeUrl(null)).toBeNull();
  });
});
