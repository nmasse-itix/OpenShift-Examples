# Using public certificates on your OpenShift cluster

## Context

By default, the OpenShift installer generates a self-signed Certification
Authority to issue all the certificates of the cluster. This is convenient
but it has the drawback to generate warnings in the browser.

This guide explains how to use the [Let's Encrypt](https://letsencrypt.org/)
service to get a free public certificate for your OpenShift cluster.

You can use a public certificate for:

- the OpenShift router that serves your default subdomain (`openshift_master_default_subdomain`)
- the OpenShift master

## Pre-requisites

To complete this workshop you will need to have:

- an OpenShift cluster
- your own DNS domain hosted by a public DNS hosting service (Gandi, SimpleDNS, etc.)
- the DNS domain must be under your control
- If you plan to issue a public certificate for your OpenShift master,
  it must have both a public and a private hostname.

**Note:** the OpenShift cluster does **NOT** have to be reachable on the
Internet but your DNS domain has to be registered, hosted on a public DNS
hosting service and must be under your control.

`nip.io` and `xip.io` are **NOT** compatible.

## Install acme.sh

To get a public certificate from Let's Encrypt, we will use
[acme.sh](https://github.com/Neilpang/acme.sh).

Install `acme.sh` on the Ansible control node, that is to say the server
**that runs your OpenShift playbooks**:

```sh
curl https://get.acme.sh | sh
```

## Get a public certificate for your OpenShift Router

From the Ansible control node, run the `acme.sh` command to get a certificate
for your default subdomain. In this example I used `*.app.openshift.test` but
you will have to replace it with your domain.

```sh
acme.sh --issue --dns -d 'app.openshift.test' -d '*.app.openshift.test' --yes-I-know-dns-manual-mode-enough-go-ahead-please
```

You should get something like this:

```raw
[Thu Aug  2 11:43:00 CEST 2018] Creating domain key
[Thu Aug  2 11:43:00 CEST 2018] The domain key is here: /home/nicolas/.acme.sh/app.openshift.test/app.openshift.test.key
[Thu Aug  2 11:43:00 CEST 2018] Multi domain='DNS:app.openshift.test,DNS:*.app.openshift.test'
[Thu Aug  2 11:43:00 CEST 2018] Getting domain auth token for each domain
[Thu Aug  2 11:43:02 CEST 2018] Getting webroot for domain='app.openshift.test'
[Thu Aug  2 11:43:02 CEST 2018] Getting webroot for domain='*.app.openshift.test'
[Thu Aug  2 11:43:02 CEST 2018] Add the following TXT record:
[Thu Aug  2 11:43:02 CEST 2018] Domain: '_acme-challenge.app.openshift.test'
[Thu Aug  2 11:43:02 CEST 2018] TXT value: 'y6FiU9ZCBKi8koQGGQDXWyKJYOXTTsqgU6LTd_CBAeE'
[Thu Aug  2 11:43:02 CEST 2018] Please be aware that you prepend _acme-challenge. before your domain
[Thu Aug  2 11:43:02 CEST 2018] so the resulting subdomain will be: _acme-challenge.app.openshift.test
[Thu Aug  2 11:43:02 CEST 2018] Add the following TXT record:
[Thu Aug  2 11:43:02 CEST 2018] Domain: '_acme-challenge.app.openshift.test'
[Thu Aug  2 11:43:02 CEST 2018] TXT value: 'Bo4VxqsPvOHWymqvmUR43wVoucQroe3QV041ZWjah-c'
[Thu Aug  2 11:43:02 CEST 2018] Please be aware that you prepend _acme-challenge. before your domain
[Thu Aug  2 11:43:02 CEST 2018] so the resulting subdomain will be: _acme-challenge.app.openshift.test
[Thu Aug  2 11:43:02 CEST 2018] Please add the TXT records to the domains, and re-run with --renew.
```

Go to your DNS hosting service and add the required records.

In the previous example, I would have to add:

```bind
_acme-challenge.app.openshift.test. 300 IN TXT "y6FiU9ZCBKi8koQGGQDXWyKJYOXTTsqgU6LTd_CBAeE"
_acme-challenge.app.openshift.test. 300 IN TXT "Bo4VxqsPvOHWymqvmUR43wVoucQroe3QV041ZWjah-c"
```

Please pay attention to add a dot after the domain name if you enter the FQDN
and reciprocally remove the final dot if you entered just the record name
(`_acme-challenge.app`).

Wait for the new DNS records to propagate (20-30 minutes) and check that the
new records are available:

```sh
dig _acme-challenge.app.openshift.test IN TXT
```

Once the records have been propagated, you can fetch the public certificates:

```sh
acme.sh --renew --dns -d 'app.openshift.test' -d '*.app.openshift.test' --yes-I-know-dns-manual-mode-enough-go-ahead-please
```

And everything went fine, you should get something like this:

```raw
[Thu Aug  2 13:53:15 CEST 2018] Renew: 'app.openshift.test'
[Thu Aug  2 13:53:15 CEST 2018] Multi domain='DNS:app.openshift.test,DNS:*.app.openshift.test'
[Thu Aug  2 13:53:15 CEST 2018] Getting domain auth token for each domain
[Thu Aug  2 13:53:15 CEST 2018] Verifying:app.openshift.test
[Thu Aug  2 13:53:19 CEST 2018] Success
[Thu Aug  2 13:53:19 CEST 2018] Verifying:*.app.openshift.test
[Thu Aug  2 13:53:21 CEST 2018] Success
[Thu Aug  2 13:53:24 CEST 2018] Verify finished, start to sign.
[Thu Aug  2 13:53:26 CEST 2018] Cert success.
[Thu Aug  2 13:53:26 CEST 2018] Your cert is in  /home/nicolas/.acme.sh/app.openshift.test/app.openshift.test.cer
[Thu Aug  2 13:53:26 CEST 2018] Your cert key is in  /home/nicolas/.acme.sh/app.openshift.test/app.openshift.test.key
[Thu Aug  2 13:53:26 CEST 2018] The intermediate CA cert is in  /home/nicolas/.acme.sh/app.openshift.test/ca.cer
[Thu Aug  2 13:53:26 CEST 2018] And the full chain certs is there:  /home/nicolas/.acme.sh/app.openshift.test/fullchain.cer
```

## Get a public certificate for your OpenShift Master

Using a public certificate for the OpenShift master is very similar to the
procedure for the OpenShift router but there is an additional requirement:
the master **MUST** have a public and an internal hostname.

This requirement exists because we can replace the certificate for the public
hostname with a public certificate but we cannot do the same with the internal
hostname. And if there is only one hostname that is used for both public and
internal, the public certificate will be served from within the cluster and
will mostly break your cluster. **YOU HAVE BEEN WARNED !**

First, confirm you have different hostnames for public and internal by checking
your master configuration:

```sh
$ egrep 'master(Public)?URL' /etc/origin/master/master-config.yaml
  masterPublicURL: https://master.openshift.test:8443
  masterURL: https://openshift.openshift.internal:8443
```

As you can see, in this example this master has two hostnames:

- `master.openshift.test` is the public hostname
- `master.openshift.internal` is the internal hostname

From the Ansible control node, run the `acme.sh` command to get a certificate
for your master public hostname. In this example I used `master.openshift.test` but
you will have to replace it with your domain.

```sh
acme.sh --issue --dns -d 'master.openshift.test' --yes-I-know-dns-manual-mode-enough-go-ahead-please
```

As in the previous section, go to your DNS hosting service, add the required
records, wait for the DNS propagation, and re-run the `acme.sh` command:

```sh
acme.sh --renew --dns -d 'master.openshift.test' --yes-I-know-dns-manual-mode-enough-go-ahead-please
```

## Install the certificates

Until now, we fetched the public certificates for our OpenShift router and
OpenShift master but they have not been installed yet.

Add to your Ansible inventory file:

```ini
[OSEv3:vars]
openshift_master_overwrite_named_certificates=true
openshift_master_named_certificates=[{ "certfile": "{{ lookup('env','HOME') }}/.acme.sh/master.openshift.test/master.openshift.test.cer", "keyfile": "{{ lookup('env','HOME') }}/.acme.sh/master.openshift.test/master.openshift.test.key", "cafile": "{{ lookup('env','HOME') }}/.acme.sh/master.openshift.test/ca.cer", "names": [ "master.openshift.test" ] }]
openshift_hosted_router_certificate={ "certfile": "{{ lookup('env','HOME') }}/.acme.sh/app.openshift.test/app.openshift.test.cer", "keyfile": "{{ lookup('env','HOME') }}/.acme.sh/app.openshift.test/app.openshift.test.key", "cafile": "{{ lookup('env','HOME') }}/.acme.sh/app.openshift.test/ca.cer" }
```

And run the `redeploy-certificates.yml` playbook:

```sh
ansible-playbook /usr/share/ansible/openshift-ansible/playbooks/redeploy-certificates.yml
```

You can confirm the certificates have been correctly deployed:

```raw
$ openssl s_client -host test.app.openshift.test -port 443 -servername test.app.openshift.test < /dev/null |head -n 9
depth=1 C = US, O = Let's Encrypt, CN = Let's Encrypt Authority X3
verify error:num=20:unable to get local issuer certificate
verify return:0
poll errorCONNECTED(00000005)
---
Certificate chain
 0 s:/CN=app.openshift.test
   i:/C=US/O=Let's Encrypt/CN=Let's Encrypt Authority X3
 1 s:/C=US/O=Let's Encrypt/CN=Let's Encrypt Authority X3
   i:/O=Digital Signature Trust Co./CN=DST Root CA X3
---
Server certificate
```

```raw
$ openssl s_client -host master.openshift.test -port 8443 -servername master.openshift.test < /dev/null |head -n 9
depth=1 C = US, O = Let's Encrypt, CN = Let's Encrypt Authority X3
verify error:num=20:unable to get local issuer certificate
verify return:0
poll errorCONNECTED(00000005)
---
Certificate chain
 0 s:/CN=master.openshift.test
   i:/C=US/O=Let's Encrypt/CN=Let's Encrypt Authority X3
 1 s:/C=US/O=Let's Encrypt/CN=Let's Encrypt Authority X3
   i:/O=Digital Signature Trust Co./CN=DST Root CA X3
---
Server certificate
```

## Further improvements

The certificates issued by Let's Encrypt are valid for only 90 days. So you
will have to get a new certificate and install it with the
`redeploy-certificates.yml` playbook every 90 days or less.

If your DNS hosting service is listed in the [supported Automatic DNS API Integration page](https://github.com/Neilpang/acme.sh#7-automatic-dns-api-integration),
you can leverage it to automate the process.
