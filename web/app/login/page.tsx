import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
      </div>
      <SignIn
        path="/login"
        routing="path"
        signUpUrl="/signup"
        forceRedirectUrl={process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL}
      />
    </div>
  );
}
