#!/bin/sh
CONFIG_FILE="/etc/ocis/ocis.yaml"

sed -i "s|^  jwt_secret:.*|  jwt_secret: mysecret|" "$CONFIG_FILE"

if grep -q "additional_policies" "$CONFIG_FILE" 2>/dev/null; then
  echo "additional_policies already present, skipping"
else
  sed -i '/^proxy:/a\  additional_policies:\n    - name: ocis\n      routes:\n        - endpoint: /app-registry/\n          service: com.owncloud.api.app-registry\n        - endpoint: /wopi/\n          backend: http://localhost:9300\n          unprotected: true' "$CONFIG_FILE"
fi

sed -i '/^collaboration:/,/^[a-z]/{s|^    secret:.*|    secret: mysecret|}' "$CONFIG_FILE"

# Add proof_disable under collaboration.app
sed -i '/^    insecure: true$/a\    proof_disable: true' "$CONFIG_FILE"

echo "Patched ocis.yaml"
