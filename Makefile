.PHONY: clean
clean:
	rm -rf data
	rm -rf build
	rm -rf generated

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

.PHONY: deploy-local
deploy-local: remove-subgraph-yaml
	cp profiles/subgraph-local.yaml subgraph.yaml
	make build
	yarn graph remove --node http://localhost:8020/ autonolas && \
	yarn graph create --node http://localhost:8020/ autonolas && \
	yarn graph deploy --node http://localhost:8020/ --ipfs https://registry.autonolas.tech autonolas -l 0.1.0

.PHONY: deploy-staging
deploy-staging: remove-subgraph-yaml
	cp profiles/subgraph-prod.yaml subgraph.yaml
	make build
	yarn graph remove --node $$GRAPH_NODE autonolas-staging && \
	yarn graph create --node $$GRAPH_NODE autonolas-staging && \
	yarn graph deploy --node $$GRAPH_NODE --ipfs https://registry.autonolas.tech autonolas-staging -l 0.1.0

.PHONY: deploy-prod
deploy-prod: remove-subgraph-yaml
	cp profiles/subgraph-prod.yaml subgraph.yaml
	yarn graph remove --node $$GRAPH_NODE autonolas && \
	yarn graph create --node $$GRAPH_NODE autonolas && \
	yarn graph deploy --node $$GRAPH_NODE --ipfs https://registry.autonolas.tech autonolas -l 0.1.0
