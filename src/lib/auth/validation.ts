const localPartPattern = /^[A-Za-z0-9!#$%&'*+/=?^_\x60{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_\x60{|}~-]+)*$/;

/** ASCII dot-atom mailbox. Preserve dots, plus suffixes and local-part casing. */
export function corporateEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  const parts = email.split("@");
  if (parts.length !== 2 || email.length > 254) return null;
  const [local, domain] = parts;
  if (!local || local.length > 64 || !localPartPattern.test(local)) return null;
  if (domain.toLowerCase() !== "dialogo.com.br") return null;
  return `${local}@dialogo.com.br`;
}

function text(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === "string" ? value : null;
}

export function validateSignIn(form: FormData) {
  const email = corporateEmail(text(form, "email"));
  const password = text(form, "password");
  if (!email) return { ok: false as const, message: "Informe um e-mail válido do domínio dialogo.com.br." };
  if (!password) return { ok: false as const, message: "Informe sua senha." };
  return { ok: true as const, data: { email, password } };
}

export function validateSignUp(form: FormData) {
  const credentials = validateSignIn(form);
  if (!credentials.ok) return credentials;
  if (credentials.data.password !== text(form, "passwordConfirmation")) {
    return { ok: false as const, message: "A senha e a confirmação devem ser iguais." };
  }
  const nome = text(form, "nome")?.trim();
  const cargo = text(form, "cargoArea")?.trim() || null;
  const obra = text(form, "obraReferencia")?.trim() || null;
  if (!nome || nome.length > 160 || (cargo?.length ?? 0) > 160 || (obra?.length ?? 0) > 160) {
    return { ok: false as const, message: "Informe seu nome e use até 160 caracteres em cada informação declarada." };
  }
  return {
    ok: true as const,
    data: {
      ...credentials.data,
      nome,
      cargo_area_informado: cargo,
      obra_referencia_informada: obra,
    },
  };
}

/** Authentication alone grants only the own-request checkpoint. */
export function accountDestination(user: { id: string; email?: string } | null) {
  return user?.id && corporateEmail(user.email) ? "/aguardando-liberacao" : "/entrar";
}
