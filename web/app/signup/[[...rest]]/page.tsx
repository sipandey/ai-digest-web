import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#f4f4f8] flex flex-col items-center justify-center px-4 py-12">
      {/* Brand */}
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-3">
          AI Digest
        </p>
        <h1 className="text-2xl font-bold text-[#14141e]">Create your account</h1>
        <p className="mt-2 text-sm text-gray-500">Free forever. No credit card needed.</p>
      </div>

      <SignUp
        path="/signup"
        routing="path"
        signInUrl="/login"
        forceRedirectUrl={process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL}
        appearance={{
          variables: {
            colorBackground: "#ffffff",
            colorInputBackground: "#f4f4f8",
            colorInputText: "#14141e",
            colorText: "#14141e",
            colorTextSecondary: "#6a6a85",
            colorPrimary: "#6366f1",
            colorNeutral: "#14141e",
            borderRadius: "12px",
          },
          elements: {
            card: "shadow-none border border-gray-200 bg-white",
            formFieldInput: "bg-[#f4f4f8] border-gray-200 text-[#14141e] placeholder:text-gray-300",
            formButtonPrimary: "bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl",
            footerActionLink: "text-indigo-600 hover:text-indigo-500",
          },
        }}
      />
    </div>
  );
}
