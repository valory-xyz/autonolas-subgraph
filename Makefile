.PHONY: local-node
local-node:
	docker-compose -f nodes/local/docker-compose.yaml up

.PHONY: deploy-local
deploy-local:
	yarn graph codegen && \
	yarn graph build && \
	yarn graph remove --node http://localhost:8020/ autonolas && \
	yarn graph create --node http://localhost:8020/ autonolas && \
	yarn graph deploy --node http://localhost:8020/ --ipfs https://registry.autonolas.tech autonolas -l 0.1.0
