import { useCallback, useRef, useState } from 'react';

/** Une règle renvoie un message d'erreur (déjà traduit) ou rien si la valeur est valide. */
export type Rule<V> = (value: V[keyof V], all: V) => string | undefined | false;

/**
 * Formulaire avec validation « au bon moment » :
 * - aucun message tant que le champ n'a pas été quitté une première fois ;
 * - validation à la sortie du champ ;
 * - l'erreur disparaît dès que l'utilisateur revient corriger ;
 * - à l'envoi, tous les champs sont vérifiés et le premier en erreur reçoit le focus.
 * Le bouton d'envoi n'est jamais désactivé.
 */
export function useForm<V extends Record<string, unknown>>(initial: V, rules: Partial<Record<keyof V, Rule<V>>>) {
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof V, string>>>({});
  const touched = useRef(new Set<keyof V>());
  const refs = useRef(new Map<keyof V, HTMLElement | null>());

  const check = useCallback(
    (name: keyof V, all: V) => {
      const r = rules[name];
      const msg = r ? r(all[name], all) || undefined : undefined;
      setErrors((e) => ({ ...e, [name]: msg }));
      return msg;
    },
    [rules],
  );

  const set = useCallback(<K extends keyof V>(name: K, value: V[K]) => {
    setValues((v) => ({ ...v, [name]: value }));
    // Corriger efface l'erreur immédiatement ; la règle sera rejouée à la sortie du champ
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }, []);

  const bind = <K extends keyof V>(name: K) => ({
    name: String(name),
    value: values[name] as unknown as string,
    inputRef: (el: HTMLElement | null) => {
      refs.current.set(name, el);
    },
    onChange: (e: { target: { value: string } }) => set(name, e.target.value as V[K]),
    onFocus: () => setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e)),
    onBlur: () => {
      touched.current.add(name);
      check(name, values);
    },
  });

  /** Valide tout ; renvoie true si le formulaire est valide, sinon focalise la première erreur. */
  const validate = () => {
    let first: keyof V | undefined;
    const next: Partial<Record<keyof V, string>> = {};
    for (const name of Object.keys(rules) as (keyof V)[]) {
      touched.current.add(name);
      const msg = rules[name]!(values[name], values) || undefined;
      next[name] = msg;
      if (msg && first === undefined) first = name;
    }
    setErrors(next);
    if (first !== undefined) {
      const el = refs.current.get(first);
      el?.focus();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return false;
    }
    return true;
  };

  const reset = (v: V = initial) => {
    setValues(v);
    setErrors({});
    touched.current.clear();
  };

  return { values, setValues, set, errors, setErrors, bind, validate, reset };
}

export const isEmail = (s: unknown) => typeof s === 'string' && /^\S+@\S+\.\S{2,}$/.test(s.trim());
export const isPhone = (s: unknown) => typeof s === 'string' && s.replace(/\D/g, '').length >= 8;
