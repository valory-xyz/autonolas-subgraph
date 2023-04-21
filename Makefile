.PHONY: build
build:
	yarn graph codegen && \
	yarn graph build

.PHONY: local-node
local-node:
	docker-compose -f nodes/local/docker-compose.yaml up

.PHONY: staging-node
staging-node:
	docker-compose -f nodes/staging/docker-compose.yaml up

.PHONY: deploy-local
deploy-local: build
	yarn graph remove --node http://localhost:8020/ autonolas && \
	yarn graph create --node http://localhost:8020/ autonolas && \
	yarn graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 autonolas -l 0.1.0

.PHONY: deploy-staging
deploy-staging: build
	yarn graph remove --node http://localhost:8020/ autonolas && \
	yarn graph create --node http://localhost:8020/ autonolas && \
	yarn graph deploy --node http://localhost:8020/ --ipfs https://registry.autonolas.tech autonolas -l 0.1.0
