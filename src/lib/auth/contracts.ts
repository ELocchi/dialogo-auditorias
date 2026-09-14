export type AuthActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

export const initialAuthState: AuthActionState = { status: "idle", message: "" };

export type AuthActionResult = {
  state: AuthActionState;
  redirectTo?: "/entrar" | "/aguardando-liberacao";
};
