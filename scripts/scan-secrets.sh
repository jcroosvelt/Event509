#!/usr/bin/env bash
# Recherche de secrets dans TOUT l'historique git (toutes les branches) et dans l'arbre de travail.
# Sort avec le code 1 si un secret probable est trouvé. Les valeurs ne sont jamais affichées en entier (masquées).
# Utilisation : bash scripts/scan-secrets.sh   (aussi lancé automatiquement par .github/workflows/security.yml)
set -u
PAT='(sk_live_[A-Za-z0-9]{8,}|sk_test_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|re_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|npg_[A-Za-z0-9]{8,}|postgres(ql)?://[^:@/ ]+:[^@/ ]{6,}@|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})'
# Exceptions connues (pas des secrets) : exemple de .env.example, fichier google-services.json de l'application (clé « client »)
IGNORE='utilisateur:motdepasse|google-services\.json'
found=0
for c in $(git rev-list --all); do
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    echo "$line" | grep -Eq "$IGNORE" && continue
    short="${c:0:7}"
    file="$(echo "$line" | cut -d: -f2)"
    num="$(echo "$line" | cut -d: -f3)"
    echo "SECRET PROBABLE : commit $short, fichier $file, ligne $num (valeur masquée)"
    found=1
  done < <(git grep -I -n -E "$PAT" "$c" -- . ':!package-lock.json' ':!pubspec.lock' 2>/dev/null)
done
if [ "$found" = 1 ]; then
  echo "Un secret exposé doit être considéré comme compromis : le révoquer chez le fournisseur, puis nettoyer l'historique (voir SECURITY_AUDIT)."
  exit 1
fi
echo "Aucun secret probable dans l'historique."
