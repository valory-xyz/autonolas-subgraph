# Installation guide

## Using Helm bash tool

You can install the Helm chart by executing:
```bash
helm install --create-namespace --namespace prod autonolas-subgraph ~/.../autonolas-subgraph/charts/autonolas-subgraph/
```

You can uninstall the Helm chart by executing:
```bash
helm uninstall --namespace prod autonolas-subgraph
```

## Using Terraform

First you need to install the `helm` provider:
```tf
terraform {
  helm = {
    source  = "hashicorp/helm"
    version = "2.8.0"
  }
}

provider "helm" {
  kubernetes {
    config_path = var.kubeconfig_path
  }
}
```

Then, you can install the Helm chart by creating a `helm_chart` resource:
```tf
resource "helm_release" "autonolas-subgraph" {
  name             = "autonolas-subgraph"
  repository       = "https://github.com/valory-xyz/autonolas-subgraph/tree/feat/deployment-wrappert/charts"
  chart            = "autonolas-subgraph"
  namespace        = "prod"
  create_namespace = true
}
```

If the chart repository is not public, you can use the flags `repository_key_file`, `repository_username` or `repository_password`. You can find more information [here](https://registry.terraform.io/providers/hashicorp/helm/latest/docs/resources/release).