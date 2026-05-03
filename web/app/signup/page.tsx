import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">
          Create your account
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Free forever. No credit card needed.
        </p>
      </div>
      <SignUp
        path="/signup"
        routing="path"
        signInUrl="/login"
        forceRedirectUrl={process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL}
      />
    </div>
  );
}
