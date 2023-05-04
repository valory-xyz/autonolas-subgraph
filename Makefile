.PHONY: build
build:
	yarn graph codegen && \
	yarn graph build

.PHONY: node
node:
	docker-compose up


.PHONY: remove-subgraph-yaml
remove-subgraph-yaml:
	if [ -f subgraph.yaml ];\
	then\
		rm subgraph.yaml;\
	fi

.PHONY: deploy
deploy:
	yarn graph remove --node http://localhost:8020/ autonolas && \
	yarn graph create --node http://localhost:8020/ autonolas && \
	yarn graph deploy --node http://localhost:8020/ --ipfs https://registry.autonolas.tech autonolas -l 0.1.0

.PHONY: deploy-local
deploy-local: remove-subgraph-yaml
	cp profiles/subgraph-local.yaml subgraph.yaml
	make build
	make deploy

.PHONY: deploy-staging
deploy-staging: remove-subgraph-yaml
	cp profiles/subgraph-staging.yaml subgraph.yaml
	make build
	make deploy

.PHONY: deploy-prod
deploy-prod: remove-subgraph-yaml
	cp profiles/subgraph-prod.yaml subgraph.yaml
	make build
	make deploy