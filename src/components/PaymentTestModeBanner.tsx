const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full bg-destructive/15 border-b border-destructive/40 px-4 py-2 text-center text-sm text-destructive">
        Pagamentos em produção ainda não configurados. Conclua o go-live do Stripe para receber pagamentos reais.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full bg-warning/15 border-b border-warning/40 px-4 py-2 text-center text-sm text-warning">
        Modo de teste — pagamentos no preview não são reais.{" "}
        <a
          href="https://docs.lovable.dev/features/payments#test-and-live-environments"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-medium"
        >
          Saiba mais
        </a>
      </div>
    );
  }
  return null;
}
