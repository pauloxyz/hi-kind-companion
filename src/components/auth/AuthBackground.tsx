import farmBg from "@/assets/auth-farm-bg.jpg";

/**
 * Full-bleed decorative background used by the /auth route:
 * farm photo → navy gradient overlay → subtle flag-stripe texture.
 * Pure presentation, no props — kept isolated so the auth page component
 * stays focused on form logic.
 */
export function AuthBackground() {
  return (
    <>
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${farmBg})` }}
        aria-hidden
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg, rgba(10,22,55,0.92) 0%, rgba(10,22,55,0.78) 45%, rgba(10,22,55,0.55) 65%, rgba(255,255,255,0.78) 100%)",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-y-0 right-0 w-1/2 opacity-[0.05] mix-blend-overlay pointer-events-none"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, #ffffff 0 24px, transparent 24px 48px)" }}
        aria-hidden
      />
    </>
  );
}
