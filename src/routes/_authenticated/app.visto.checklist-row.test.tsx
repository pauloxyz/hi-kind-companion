// @vitest-environment jsdom
//
// Travas de acessibilidade para o `gateBlocked` da `ChecklistRow` em
// `/app/visto`. Estes testes existem para garantir que, sempre que o gate
// estiver ativo (contrato não assinado + passo consular), a UI cumpra três
// invariantes que leitores de tela e usuários de teclado dependem:
//
//   1. checkbox renderiza com `disabled` (impossível "concluir" sem o
//      contrato);
//   2. checkbox referencia o banner via `aria-describedby` apontando para o
//      `id` ESTÁVEL `gate-<item.id>` (a descrição é lida no foco);
//   3. o banner está visível e contém a frase canônica
//      "Oferta de trabalho aceita e contrato assinado".
//
// O ícone do banner tem `aria-hidden`, e a página de origem mantém um
// `role="status" aria-live="polite"` para anunciar tentativas bloqueadas —
// como esse live region vive no escopo da página (não da row), não é
// testado aqui; ele é coberto em `e2e/visa-gate-journey.spec.ts`.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ChecklistRow } from "./app.visto";

afterEach(() => cleanup());

type Item = {
  id: string;
  step_key: string;
  step_label: string;
  sort_order: number | null;
  is_completed: boolean | null;
  event_at: string | null;
  due_at: string | null;
};

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-ds160",
    step_key: "ds160",
    step_label: "Formulário DS-160 preenchido e enviado",
    sort_order: 60,
    is_completed: false,
    event_at: null,
    due_at: null,
    ...overrides,
  };
}

function renderRow(opts: {
  item?: Partial<Item>;
  gateBlocked?: boolean;
  onToggle?: () => void;
}) {
  const item = makeItem(opts.item);
  return render(
    <ChecklistRow
      item={item}
      meta={undefined}
      attachments={[]}
      gateBlocked={opts.gateBlocked}
      onToggle={opts.onToggle ?? vi.fn()}
      onDate={vi.fn()}
      announce={vi.fn()}
      refetchAttachments={vi.fn()}
      onOpenViewer={vi.fn()}
    />,
  );
}

describe("ChecklistRow — a11y do gate de contrato", () => {
  describe("gateBlocked = true (contrato não assinado, passo gated)", () => {
    it("desabilita o checkbox", () => {
      renderRow({ gateBlocked: true });
      const checkbox = screen.getByRole("checkbox", { name: /Marcar etapa:/i });
      expect((checkbox as HTMLButtonElement).disabled).toBe(true);
    });

    it("renderiza o banner com a frase canônica do gate", () => {
      renderRow({ gateBlocked: true });
      // O banner é um <p> com id `gate-<item.id>`.
      const banner = document.getElementById("gate-item-ds160");
      expect(banner, "banner gate-<id> precisa existir no DOM").not.toBeNull();
      expect(banner!.textContent ?? "").toMatch(
        /Dispon[íi]vel depois que voc[êe] marcar.*Oferta de trabalho aceita e contrato assinado/i,
      );
    });

    it("liga aria-describedby do checkbox ao id do banner", () => {
      renderRow({ gateBlocked: true });
      const checkbox = screen.getByRole("checkbox", { name: /Marcar etapa:/i });
      expect(checkbox.getAttribute("aria-describedby")).toBe("gate-item-ds160");
    });

    it("marca o ícone do banner como aria-hidden (decorativo)", () => {
      renderRow({ gateBlocked: true });
      const banner = document.getElementById("gate-item-ds160")!;
      const hiddenSvg = banner.querySelector("svg[aria-hidden]");
      expect(hiddenSvg, "ícone do banner deve ter aria-hidden").not.toBeNull();
    });

    it("marca o container da row com data-gate-blocked='true'", () => {
      renderRow({ gateBlocked: true });
      const row = document.getElementById("step-item-ds160")!;
      expect(row.getAttribute("data-gate-blocked")).toBe("true");
    });

    it("aplica opacidade reduzida (sinalização visual do bloqueio)", () => {
      renderRow({ gateBlocked: true });
      const row = document.getElementById("step-item-ds160")!;
      // A classe `opacity-60` é o sinal visual do bloqueio — testar a
      // presença da classe é suficiente; o valor numérico é coberto pelo
      // Tailwind. Garante regressão visual sem flake de CSS computado.
      expect(row.className).toMatch(/\bopacity-60\b/);
    });

    it("também bloqueia quando o passo está completo (drift de dados)", () => {
      renderRow({
        gateBlocked: true,
        item: { is_completed: true },
      });
      const checkbox = screen.getByRole("checkbox", { name: /Marcar etapa:/i });
      expect((checkbox as HTMLButtonElement).disabled).toBe(true);
      // Estado interno do Radix Checkbox reflete `checked`:
      expect(checkbox.getAttribute("data-state")).toBe("checked");
      // Banner segue presente para orientar a correção via "Oferta aceita".
      expect(document.getElementById("gate-item-ds160")).not.toBeNull();
      // aria-describedby permanece ligado mesmo no estado completo.
      expect(checkbox.getAttribute("aria-describedby")).toBe("gate-item-ds160");
    });
  });

  describe("gateBlocked = false (contrato assinado ou passo livre)", () => {
    it("habilita o checkbox", () => {
      renderRow({ gateBlocked: false });
      const checkbox = screen.getByRole("checkbox", { name: /Marcar etapa:/i });
      expect((checkbox as HTMLButtonElement).disabled).toBe(false);
    });

    it("não renderiza o banner do gate", () => {
      renderRow({ gateBlocked: false });
      expect(document.getElementById("gate-item-ds160")).toBeNull();
    });

    it("não define aria-describedby (sem descrição extra)", () => {
      renderRow({ gateBlocked: false });
      const checkbox = screen.getByRole("checkbox", { name: /Marcar etapa:/i });
      expect(checkbox.getAttribute("aria-describedby")).toBeNull();
    });

    it("não marca data-gate-blocked na row", () => {
      renderRow({ gateBlocked: false });
      const row = document.getElementById("step-item-ds160")!;
      expect(row.hasAttribute("data-gate-blocked")).toBe(false);
    });

    it("não aplica opacity-60", () => {
      renderRow({ gateBlocked: false });
      const row = document.getElementById("step-item-ds160")!;
      expect(row.className).not.toMatch(/\bopacity-60\b/);
    });
  });
});
