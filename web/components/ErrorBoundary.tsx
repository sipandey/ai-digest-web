"use client";

import { Component, ReactNode } from "react";

type Props = { children: ReactNode; label?: string };
type State = { error: Error | null };

/**
 * Catches uncaught errors anywhere in the wrapped subtree and shows a friendly
 * recovery UI instead of a white screen.  Wrap page-level client components.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Log to console in dev; swap for a real error service (Sentry etc.) later.
    console.error(`[ErrorBoundary${this.props.label ? ` — ${this.props.label}` : ""}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#f4f4f8] flex items-center justify-center px-4">
          <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#14141e]">Something went wrong</p>
              <p className="text-xs text-gray-400 mt-1">
                {this.props.label ? `Error in ${this.props.label}.` : "An unexpected error occurred."}
              </p>
            </div>
            <button
              onClick={() => {
                this.setState({ error: null });
                window.location.reload();
              }}
              className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
