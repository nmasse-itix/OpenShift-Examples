# Using Skopeo to copy docker images between registries

## Context

When you need to deploy a container in OpenShift, you need an image of
this container. This image can be built from scratch or from another
image or be available "off-the-shelf" in another registry.

To use an image, three options are possible:

1. reference the target image directly in the build / deployment
2. use an image stream that references the target image
3. copy the target image to the OpenShift registry

Each approach as pros and cons.

If you reference the target image directly in the build / deployment,
any change to the reference will be cumbersome to implement. For instance,
if you want to change all `centos:7.4` images by a `centos:7.5`, it will
require a lot of work.

The [Image Stream](https://docs.openshift.com/container-platform/latest/dev_guide/managing_images.html)
is an indirection level that let you manage your images in a more flexible
way. An Image Stream contains tags and each tag can be:

- a reference to an external image such as `docker.io/centos:7` or
  `registry.access.redhat.com/rhel7:7.5`.
- a reference to another tag in the same image stream
- a reference to a tag in another image stream
- a container image by itself

A reference can be used to point to an existing image which is fetched
directly by the OpenShift nodes when this image is needed (the pointed
image is not "mirrored" in the OpenShift registry).

Alternatively, it is possible to copy physically the image to the
OpenShift registry. In this way, if the external registry is unavailable,
the image can still be fetched from within the OpenShift cluster.

Also, some OpenShift clusters are completely disconnected from any other
network and copying images in the OpenShift registry is the only way to
use an image.

In this document, we will see how to copy images between registries using
[skopeo](https://github.com/projectatomic/skopeo).

## Installing skopeo

Skopeo is available in RHEL, Fedora and CentOS as an RPM package:

```sh
yum install skopeo
```

On MacOS, you can install Skopeo using brew:

```sh
brew install skopeo
```

## Copying locally an image from DockerHub

Let's say, we need to make a local copy of the `centos:7`, `centos:7.5.1804`,
`centos:7.4.1708` and `rhel7:7.5` images.

First, you can inspect the target images using `skopeo inspect`:

```sh
skopeo inspect docker://docker.io/centos:7
skopeo inspect docker://docker.io/centos:7.5.1804
skopeo inspect docker://docker.io/centos:7.4.1708
```

The RHEL 7.5 image is hosted on a different registry (`registry.access.redhat.com`)
and needs to be fetched from a system registered on RHN/Satellite with the proper subscriptions.

First, make sure you are on a RHEL system:

```raw
$ cat /etc/redhat-release
Red Hat Enterprise Linux Server release 7.4 (Maipo)
```

Make sure the system is registered with RHN/Satellite:

```raw
$ sudo subscription-manager status
+-------------------------------------------+
   System Status Details
+-------------------------------------------+
Overall Status: Current
```

And then run the `skopeo inspect` as root:

```sh
sudo skopeo inspect docker://registry.access.redhat.com/rhel7:7.5
```

The `skopeo inspect` command queries information about the image
from the remote registry and prints them as JSON. If needed, you can then
extract the relevant fields using [jq](https://stedolan.github.io/jq/).

Now that you inspected the desired images, you can copy them locally:

```sh
skopeo copy docker://docker.io/centos:7 oci:./target:centos:7
skopeo copy docker://docker.io/centos:7.5.1804 oci:./target:centos:7.5.1804
skopeo copy docker://docker.io/centos:7.4.1708 oci:./target:centos:7.4.1708
sudo skopeo copy docker://registry.access.redhat.com/rhel7:7.5 oci:./target:rhel7:7.5
```

**Note:** we used `sudo` for the last command since we need to authenticate
to the Red Hat Registry with the machine credentials (the ones stored in
`/etc/docker/certs.d/registry.access.redhat.com`).

The image have been copied locally, in a directory named `./target`. This
directory is in the OCI format (Open Container Initiative).

You can inspect the local copy of those images with:

```sh
skopeo inspect oci:./target:centos:7
skopeo inspect oci:./target:centos:7.5.1804
skopeo inspect oci:./target:centos:7.4.1708
skopeo inspect oci:./target:rhel7:7.5
```

## Accessing the OpenShift registry with `skopeo`

To access the OpenShift registry, we need to:

- find the URL of the registry
- create a service account
- give the proper privileges to this service account in order to pull or push
  to the registry

First, you can find the **public URL** of the registry by login as `cluster-admin`
on your OpenShit cluster and querying:

```sh
oc get route docker-registry -n default -o 'jsonpath={.spec.host}{"\n"}'
```

If you are logged in on a node of your cluster, you can also reach the
OpenShift registry by its **private URL**:

```sh
docker-registry.default.svc.cluster.local:5000
```

In the rest of this guide, the registry URL will be replaced by an environment
variable named `REGISTRY`.

If you are on one of your openshift nodes, you can use the internal URL:

```sh
REGISTRY=docker-registry.default.svc.cluster.local:5000
```

Otherwise, you can use the public URL:

```sh
REGISTRY="$(oc get route docker-registry -n default -o 'jsonpath={.spec.host}')"
```

Then, create a project (or re-use an existing one) to hold the `skopeo`
service account:

```sh
oc new-project admin
```

And create the service account:

```sh
oc create serviceaccount skopeo
```

Extract the token of the `skopeo` service account:

```sh
oc get secrets -o jsonpath='{range .items[?(@.metadata.annotations.kubernetes\.io/service-account\.name=="skopeo")]}{.metadata.annotations.openshift\.io/token-secret\.value}{end}' |tee skopeo-token
```

For the rest of this guide, the token will be replaced by an environment variable named `TOKEN`.

You can set it using:

```sh
TOKEN="$(cat skopeo-token)"
```

You can check that this token is working properly by inspecting an image stream
in the `openshift` namespace:

```sh
skopeo inspect --creds="skopeo:$TOKEN" docker://$REGISTRY/openshift/nodejs
```

`nodejs` is an image stream that is provisioned by default on every OpenShift
cluster. If it is not there on yours, you can pick any image stream in the
`openshift` namespace:

```sh
oc get is -n openshift
```

## Pushing an image to the OpenShift registry

If you want to push an image in the OpenShift registry, you will have to:

- create a project to hold the pushed images
- grant the right to push images in this project to the `skopeo` service
  account

First, create a new project (or re-use an existing one) to hold the images
that you will push:

```sh
oc new-project my-images
```

And then grant the right to push images in the `my-images` project to the
`skopeo` service account (that has been defined in the `admin` project):

```sh
oc adm policy add-role-to-user system:image-builder -n my-images system:serviceaccount:admin:skopeo
```

You can then copy your images to the OpenShift registry, in the `my-images`
project:

```sh
skopeo copy --dest-creds="skopeo:$TOKEN" oci:./target:rhel7:7.5 docker://$REGISTRY/my-images/rhel7:7.5
```

Did you know that even if you can store the images locally, you can also copy
them "on the fly" without any local storage ?

Try to copy an image from the Docker Hub directly to the OpenShift registry:

```sh
skopeo copy --dest-creds="skopeo:$TOKEN" docker://docker.io/centos:7 docker://$REGISTRY/my-images/centos:7
```

## Pulling an image to the OpenShift registry

If you want to pull an image from the OpenShift registry, you will have to:

- have access to the project that hold the images
- grant the right to pull images in this project to the `skopeo` service
  account

First, make sure you have access to the project that holds the images
(in this example, the project is named `other-images`):

```sh
oc get imagestream -n other-images
```

And then grant the right to pull images from the `other-images` project to the
`skopeo` service account (that has been defined in the `admin` project):

```sh
oc adm policy add-role-to-user system:image-puller -n other-images system:serviceaccount:admin:skopeo
```

You can then copy your images from the OpenShift registry, located in the
`other-images` project:

```sh
skopeo copy --src-creds="skopeo:$TOKEN" docker://$REGISTRY/other-images/myimage:latest oci:./target:myimage:latest
```

## Persist the registry credentials

Instead of passing the registry credentials on the command line, you can store
them in a configuration file.

Skopeo can re-use out-of-the-box any credential defined in the Docker/CRI-O
configuration.

If you have Docker installed locally, you can login to the registry:

```sh
docker login -u skopeo -p "$TOKEN" "$REGISTRY"
```

**Note:** to use the docker login, you need to be root or member of the
`docker` group.

If you do not have docker installed locally or if you are neither root nor
member of the `docker` group, you can generate a Docker configuration
manually:

```sh
mkdir -p $HOME/.docker
m4 "-D__REGISTRY__=$REGISTRY" "-D__BASE64AUTH__=$(echo -n "skopeo:$TOKEN" |base64 -w0)" < config.json.m4 > $HOME/.docker/config.json
chmod 600 $HOME/.docker/config.json
```

Try to inspect an image from the OpenShift registry without any explicit
credentials:

```sh
skopeo inspect docker://$REGISTRY/openshift/nodejs:latest
```

## SSL/TLS issues

If you are using skopeo from a machine that is not part of the cluster,
you will have to trust the OpenShift CA Certificate on this machine.

Otherwise, you will get an SSL/TLS Certificate Validation error:

```sh
FATA[0000] pinging docker registry returned: Get https://docker-registry-default.app.itix.fr/v2/: x509: certificate signed by unknown authority
```

If you need to trust the OpenShift CA, you will have to:

- fetch it from the master
- store it in your CA Trust Store
- update the CA Trust Store

You can fetch the OpenShift CA certificate by using `openssl s_client` to
connect to the master:

```sh
openssl s_client -host openshift.itix.fr -port 8443 -showcerts > trace < /dev/null
perl -0777 -ne 'while (m|((-----BEGIN CERTIFICATE-----)[-A-Za-z0-9+/=\n]+(-----END CERTIFICATE-----))|igs) { $cert = $1 }; print $cert, "\n";' > openshift-ca.crt
```

You can check that the fetched certificate is correct with:

```sh
cat openshift-ca.crt
openssl x509 -noout -text -in openshift-ca.crt
```

If it is correct, you can copy the CA certificate in the CA Trust Store:

```sh
sudo cp openshift-ca.crt /etc/pki/ca-trust/source/anchors/skopeo-openshift-ca.crt
```

You can now update the CA Trust Store:

```sh
sudo update-ca-trust extract
```

Otherwise, you can just pass the `--tls-verify=false` or `--src-tls-verify=false`/`--dest-tls-verify=false` options to skopeo...

## Conclusion

Skopeo is a powerful tool to copy and archive container images. It is
self-contained and does not depend on the Docker daemon.

You can use it to copy images between registries, including the OpenShift
registry.
