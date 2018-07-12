# Custom HTTP Probe

## Context

An application is deployed in OpenShift and has no built-in liveness/readiness
probes. This example shows how to implement a custom probe.

## The sample application

This sample app has three probes:

- a standard liveness probe
- a standard readiness probe
- a custom probe

The app takes about 30 seconds to boot and then exhibit two endpoints:

- `/please-die` will switch the liveness probe to "dead"
- `/please-resuscitate` will switch the liveness probe to "alive"

The custom probe is a mix of everything you can find in a business app:

- when the app is alive, it returns a non-200 HTTP status with JSON content
- when the app is dead, it returns a 500 HTTP status with HTML content

## Deploy the sample application

```sh
oc new-app nodejs~https://github.com/nmasse-itix/OpenShift-Examples.git --name myapp --context-dir=Custom-HTTP-Probe
oc expose svc/myapp
```

## Play with it

```sh
export SAMPLE_APP_URL="http://$(oc get route myapp -o jsonpath='{.spec.host}')" && echo $SAMPLE_APP_URL
```

Print some help:

```sh
curl $SAMPLE_APP_URL/ -D -
```

Check if the app is ready:

```sh
curl $SAMPLE_APP_URL/probe/readiness -D -
```

Let the app die:

```sh
curl $SAMPLE_APP_URL/please-die -D -
```

Check if the app is alive:

```sh
curl $SAMPLE_APP_URL/probe/liveness -D -
```

Let the app resuscitate:

```sh
curl $SAMPLE_APP_URL/please-resuscitate -D -
```

Inspect the custom probe:

```sh
curl $SAMPLE_APP_URL/please-die -D -
curl $SAMPLE_APP_URL/probe/custom -D -
```

```sh
curl $SAMPLE_APP_URL/please-resuscitate -D -
curl $SAMPLE_APP_URL/probe/custom -D -
```

## Use the standard probes

Add the liveness probe:

```sh
oc patch dc myapp --type=json -p '[ { "op": "add", "path": "/spec/template/spec/containers/0/livenessProbe", "value": { "initialDelaySeconds": 5, "timeoutSeconds": 5, "httpGet": { "path": "/probe/liveness", "port": 8080 } } } ]'
```

Add the readiness probe:

```sh
oc patch dc myapp --type=json -p '[ { "op": "add", "path": "/spec/template/spec/containers/0/readinessProbe", "value": { "initialDelaySeconds": 20, "timeoutSeconds": 5, "httpGet": { "path": "/probe/readiness", "port": 8080 } } } ]'
```

Watch the deployment:

```sh
oc get pods -w
```

Let the app die:

```sh
curl $SAMPLE_APP_URL/please-die -D -
```

Watch the app being restarted:

```sh
oc get pods -w
```

## Use the custom probe

Review the [probe.py code](probe.py).

Create a configMap containing the custom probe code:

```sh
oc create configmap myapp-probe --from-file probe.py
```

Mount the configMap on `/opt/probe`:

```sh
oc volume dc/myapp --add --overwrite --type=configMap --configmap-name=myapp-probe --default-mode=755 --mount-path=/opt/probe --name probe --confirm
```

Replace the standard liveness and readiness probes by the custom one:

```sh
oc patch dc myapp --type=json -p '[ { "op": "replace", "path": "/spec/template/spec/containers/0/livenessProbe", "value": { "initialDelaySeconds": 5, "timeoutSeconds": 5, "exec": { "command": [ "/opt/probe/probe.py", "http://localhost:8080/probe/custom" ] } } } ]'
```

```sh
oc patch dc myapp --type=json -p '[ { "op": "replace", "path": "/spec/template/spec/containers/0/readinessProbe", "value": { "initialDelaySeconds": 5, "timeoutSeconds": 5, "exec": { "command": [ "/opt/probe/probe.py", "http://localhost:8080/probe/custom" ] } } } ]'
```

Let the app die:

```sh
curl $SAMPLE_APP_URL/please-die -D -
```

Watch the app being restarted:

```sh
oc get pods -w
```