import { useAuth } from "@/lib/auth-context";

export function useEffectiveUser() {
  const { user, isLoading, isAuthenticated, refetch } = useAuth();
  
  // The API already returns the effective user's data when impersonating
  // We just need to pass it through with the impersonation flag
  const impersonation = (user as any)?.impersonation;
  
  return {
    user,
    isLoading,
    isAuthenticated,
    refetch,
    isImpersonating: impersonation?.isImpersonating || false,
  };
}
