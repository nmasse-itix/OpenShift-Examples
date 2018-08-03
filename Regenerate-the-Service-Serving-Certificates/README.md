# Troubleshooting certificates in OpenShift

## Context

OpenShift can issue TLS certificates for any service deployed in OpenShift.
Those certificates can then be used by pods to serve content over TLS.

When re-deploying certificates using the `redeploy-certificates.yml`, the
OpenShift Service Signer CA is re-generated, thus invalidating all the
previously generated certificates.

The first symptom is usually the Web Console not working anymore (502 HTTP Status Code).

## Diagnosis

Move to the OpenShift Web Console project:

```sh
oc project openshift-web-console
```

Check that the pods are deployed and running:

```raw
# oc get pods
NAME                          READY     STATUS    RESTARTS   AGE
webconsole-56c6745c85-4rpsk   1/1       Running   6          125d
```

In the logs of the web console, you should have explicit messages:

```raw
# oc logs -f webconsole-56c6745c85-4rpsk
I0803 09:46:40.437363       1 start.go:201] OpenShift Web Console Version: v3.9.14
I0803 09:46:40.437533       1 serve.go:89] Serving securely on 0.0.0.0:8443
I0803 09:48:30.824930       1 logs.go:41] http: TLS handshake error from 10.128.0.1:54128: remote error: tls: bad certificate
I0803 09:51:15.502322       1 logs.go:41] http: TLS handshake error from 10.128.0.1:34450: remote error: tls: bad certificate
I0803 09:51:17.643076       1 logs.go:41] http: TLS handshake error from 10.128.0.1:34554: remote error: tls: bad certificate
```

Output the webconsole certificate:

```sh
oc get secret webconsole-serving-cert -o jsonpath='{ .data.tls\.crt }' |base64 -d |openssl x509 -noout -text
```

Check against the OpenShift Service Signer certificate on the master:

```sh
openssl x509 -noout -text -in /etc/origin/master/service-signer.crt
```

The `Issuer DN` in the first command must be the `Subject DN` of the second command.

If they are different, you need to re-generate the webconsole certificates
(as well as all the other service certificates).

## Regenerate the Web Console certificates

Delete the `webconsole-serving-cert` certificate and touch the `webconsole` service:

```sh
oc delete secret webconsole-serving-cert
oc patch service webconsole --type=json -p '[ { "op": "remove", "path": "/metadata/annotations/service.alpha.openshift.io~1serving-cert-signed-by" } ]'
```

Re-deploy the webconsole with the new certificates:

```sh
oc delete pods -l webconsole=true
```

## Regenerate all the other Service Serving Certificates

You can get a list of all the impacted services with:

```sh
oc get services --all-namespaces -o jsonpath='{range .items[?(@.metadata.annotations.service\.alpha\.openshift\.io/serving-cert-secret-name)]}{.metadata.namespace} {.metadata.name} {.metadata.annotations.service\.alpha\.openshift\.io/serving-cert-secret-name}{"\n"}{end}'
```

Since the list would be quite long, proper automation is needed.

You can use the provided [ansible playbook](regenerate-service-certificates.yaml)
to regenerates all the certificates and re-deploy all the pods behind the affected
services:

```sh
ansible-playbook regenerate-service-certificates.yaml
```

## References

- [Service Serving Certificate Secrets](https://docs.openshift.com/container-platform/3.9/dev_guide/secrets.html#service-serving-certificate-secrets)