#!/usr/bin/env bash
set -euo pipefail

source_dir="${1:?usage: install-em-crm-skill.sh SOURCE_DIR}"
state_dir="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"
skill_dir="$state_dir/skills/em-crm"
legacy_skill_dir="$state_dir/workspace/skills/em-crm"
secret_dir="$state_dir/secrets"
secret_file="$secret_dir/em-crm-token.txt"
write_secret_file="$secret_dir/em-crm-write-token.txt"
config_file="$state_dir/openclaw.json"
crm_url=http://100.126.177.82:3001

IFS= read -r crm_token
crm_token="${crm_token%$'\r'}"
if [[ ${#crm_token} -lt 24 ]]; then
  echo "CRM token is missing or too short" >&2
  exit 1
fi
IFS= read -r crm_write_token
crm_write_token="${crm_write_token%$'\r'}"
if [[ ${#crm_write_token} -lt 24 || "$crm_write_token" == "$crm_token" ]]; then
  echo "CRM write token is missing, too short, or matches the read token" >&2
  exit 1
fi

install -d -m 700 "$secret_dir"
printf '%s' "$crm_token" >"$secret_file"
chmod 600 "$secret_file"
printf '%s' "$crm_write_token" >"$write_secret_file"
chmod 600 "$write_secret_file"

install -d -m 755 "$skill_dir/scripts"
install -m 644 "$source_dir/SKILL.md" "$skill_dir/SKILL.md"
install -m 755 "$source_dir"/scripts/*.sh "$skill_dir/scripts/"

# Keep an earlier workspace-scoped installation synchronized if it exists.
if [[ -d "$legacy_skill_dir" ]]; then
  install -d -m 755 "$legacy_skill_dir/scripts"
  install -m 644 "$source_dir/SKILL.md" "$legacy_skill_dir/SKILL.md"
  install -m 755 "$source_dir"/scripts/*.sh "$legacy_skill_dir/scripts/"
fi

backup_file="$config_file.backup-em-crm-$(date +%Y%m%d%H%M%S)"
cp -p "$config_file" "$backup_file"

temp_config="$(mktemp "$state_dir/openclaw.json.em-crm.XXXXXX")"
trap 'rm -f "$temp_config"' EXIT

jq --arg secret_file "$secret_file" --arg write_secret_file "$write_secret_file" --arg crm_url "$crm_url" '
  .secrets = (.secrets // {})
  | .secrets.providers = (.secrets.providers // {})
  | .secrets.providers.em_crm_token_file = {
      source: "file",
      path: $secret_file,
      mode: "singleValue"
    }
  | .secrets.providers.em_crm_write_token_file = {
      source: "file",
      path: $write_secret_file,
      mode: "singleValue"
    }
  | .skills = (.skills // {})
  | .skills.entries = (.skills.entries // {})
  | .skills.entries["em-crm"] = ((.skills.entries["em-crm"] // {}) + {
      enabled: true,
      apiKey: {
        source: "file",
        provider: "em_crm_token_file",
        id: "value"
      },
      env: ((.skills.entries["em-crm"].env // {}) + {
        EM_CRM_URL: $crm_url
      })
    })
' "$config_file" >"$temp_config"

jq empty "$temp_config"
chmod --reference="$config_file" "$temp_config"
mv "$temp_config" "$config_file"

EM_CRM_TOKEN="$crm_token" EM_CRM_URL="$crm_url" "$skill_dir/scripts/ops-summary.sh" \
  | jq '{ok, source, generatedAt, stats: {totalContacts: .stats.totalContacts, openOpportunities: .stats.openOpportunities, openTasks: .stats.openTasks}}'

echo "Installed em-crm skill"
echo "Config backup: $backup_file"
