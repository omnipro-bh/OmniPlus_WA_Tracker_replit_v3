import { useAuth } from "@/lib/auth-context";

export function useEffectiveUser() {
  const { user, isLoading, isAuthenticated, refetch } = useAuth();
  
  const impersonation = (user as any)?.impersonation;
  
  // If impersonating, return the impersonated user's data merged with admin privileges
  if (impersonation?.isImpersonating && impersonation?.impersonatedUser) {
    const effectiveUser = {
      ...impersonation.impersonatedUser,
      // Keep admin role for authorization checks
      isAdmin: user?.role === "admin",
      actualRole: user?.role,
      // Include impersonation metadata for UI
      impersonation: {
        isImpersonating: true,
        admin: impersonation.admin,
      },
    };
    
    return {
      user: effectiveUser,
      isLoading,
      isAuthenticated,
      refetch,
      isImpersonating: true,
    };
  }
  
  // Not impersonating, return normal user data
  return {
    user,
    isLoading,
    isAuthenticated,
    refetch,
    isImpersonating: false,
  };
}
