# second-brain-app

PWA-Add-on zu einem privaten Obsidian-Vault. Enthält nur Code, keine Daten.
Die App schreibt mit einem lokal gespeicherten, fine-grained GitHub-Token direkt in das private Vault-Repo.
Quelle und Spezifikation: `app/` im Vault-Repo.

## Tests

Ende-zu-Ende-Tests mit Playwright gegen eine simulierte GitHub-API und einen frei erfundenen Test-Vault (`tests/fixtures/vault`, keine echten Daten). Sie laufen bei jedem Push in GitHub Actions.

```
npm ci
npx playwright install chromium
npm test
```

