# AURA - common tasks. Thin wrappers around pnpm (see SETUP.md); every target works the same as
# running the pnpm command it shows. `make help` lists them.

PNPM ?= pnpm
.DEFAULT_GOAL := help

.PHONY: help install env dev runtime api web build typecheck lint test cli cli-unlink terminal-secret clean doctor

help: ## Show this list
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install every app and package (one pnpm workspace, one lockfile)
	$(PNPM) install

env: ## Create missing .env files from each app's .env.example (never overwrites)
	@for app in agent-runtime api web; do \
		if [ -f apps/$$app/.env ]; then echo "apps/$$app/.env exists - left as is"; \
		else cp apps/$$app/.env.example apps/$$app/.env && echo "created apps/$$app/.env - fill it in"; fi; \
	done

dev: ## Run agent-runtime, api and web together (Ctrl+C stops all three)
	$(PNPM) --parallel --filter agent-runtime --filter api --filter web run dev

runtime: ## Run only apps/agent-runtime (http://localhost:4111)
	$(PNPM) --filter agent-runtime run dev

api: ## Run only apps/api (http://localhost:4000)
	$(PNPM) --filter api run dev

web: ## Run only apps/web (http://localhost:5173)
	$(PNPM) --filter web run dev

build: ## Production build of everything
	$(PNPM) -r run build

typecheck: ## TypeScript check of every app and package
	$(PNPM) -r run typecheck

lint: ## Lint apps/web
	$(PNPM) --filter web run lint

test: ## Run every app's unit tests (Vitest)
	$(PNPM) -r --no-bail run test

cli: ## Build the aura CLI and put `aura` on your PATH
	$(PNPM) --filter @aura/client --filter aura-cli run build
	cd apps/cli && $(PNPM) link --global
	@echo "done - try: aura --help"

cli-unlink: ## Remove `aura` from your PATH
	$(PNPM) remove --global aura-cli

terminal-secret: ## Print a random TERMINAL_TICKET_SECRET (paste it into apps/api/.env AND apps/agent-runtime/.env)
	@node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

doctor: ## Check prerequisites and which .env files exist
	@node -e "const [a,b]=process.versions.node.split('.').map(Number); const ok=a>22||(a===22&&b>=13); console.log((ok?'ok  ':'FAIL')+' node '+process.versions.node+' (need >= 22.13)')"
	@command -v $(PNPM) >/dev/null && echo "ok   pnpm $$($(PNPM) --version)" || echo "FAIL pnpm not found - corepack enable"
	@command -v git >/dev/null && echo "ok   git" || echo "FAIL git not found"
	@command -v python3 >/dev/null && echo "ok   python3 (web terminal)" || echo "warn python3 not found - the full web terminal needs it (or set TERMINAL_MODE=restricted)"
	@command -v docker >/dev/null && echo "ok   docker (optional)" || echo "warn docker not found - optional (Gate 4 scaffolds, Gate 7 tests, SANDBOX_MODE=docker)"
	@command -v gh >/dev/null && echo "ok   gh (optional)" || echo "warn gh not found - optional (aura push --pr)"
	@for app in agent-runtime api web; do [ -f apps/$$app/.env ] && echo "ok   apps/$$app/.env" || echo "FAIL apps/$$app/.env missing - make env"; done

clean: ## Remove build output and every node_modules (run `make install` after)
	rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/*/dist packages/*/dist apps/agent-runtime/.mastra
