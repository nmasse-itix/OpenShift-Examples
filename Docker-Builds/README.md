# Using Docker Builds

## Context

Docker builds are the basis of the basis of every image construction in
OpenShift. Even if there are other build types (S2I, Fabric8, Custom, etc.),
Docker builds are the easiest and the most ubiquitous build type.

Possible usages of the Docker build encompasses:

- Creating or modifying a base image
- Creating an image of an application

To use Docker builds, you will need two [Image Streams](https://docs.openshift.com/container-platform/latest/dev_guide/managing_images.html):

- a source or input Image Stream
- a target or output Image Stream

The [Image Stream](https://docs.openshift.com/container-platform/latest/dev_guide/managing_images.html)
is an indirection level that let you manage your images in a very flexible
way. An Image Stream contains tags and each tag can be:

- a reference to an external image such as `docker.io/centos:7` or
  `registry.access.redhat.com/rhel7:7.5`.
- a reference to another tag in the same image stream
- a reference to a tag in another image stream
- a container image by itself

In addition to the Image Streams, we will also need a `Dockerfile`.

## Practical example

In this guide, we will take a real world scenario and implement it. In this
scenario, we would like to:

- take the base image provided by Red Hat and add customizations to it
- take this new base image and create a middleware image that includes Tomcat
- take this middleware image and deploy an application on it

## Creating the source Image Stream

For this example, we will use a CentOS or RHEL base image as a basis for our
subsequent builds.

First, we will create a new project:

```sh
oc new-project docker-builds
```

Import the RHEL 7.5 images in an image stream named `rh-base`:

```sh
oc import-image rh-base:7.5 --from=registry.access.redhat.com/rhel7:7.5 --scheduled --confirm
```

Alternativelly, if you run on OpenShift Origin you can import the CentOS 7.5 images instead:

```sh
oc import-image rh-base:7.5 --from=docker.io/centos:7.5.1804 --scheduled --confirm
```

**Note:** Although, there is a `--all` flag to the `oc import-image` command
that can mirror the tags from the remote registry to the image stream, it has
shortcomings and I would not recommend using it. Namely, it will not import
all tags but just the first five. This behavior is configurable, see the
[maxImagesBulkImportedPerRepository](https://docs.openshift.com/container-platform/latest/install_config/master_node_configuration.html#master-config-image-policy-config)
parameter. Unless you really need to import a large number of tags, I would
suggest importing them explicitely.

## Creating the target Image Stream

In this example, we will create three target image streams: one for the corporate
base image we will build, one for our middleware image and one for our
target application.

Create the `custom-base` image stream:

```sh
oc create imagestream custom-base
```

Then, the `custom-tomcat` image stream:

```sh
oc create imagestream custom-tomcat
```

And the `target-app` image stream:

```sh
oc create imagestream target-app
```

## Create the first Docker build that builds the corporate base image

Review the [Dockerfile](custom-base/Dockerfile) of our corporate base image and try to
build it locally:

```sh
docker build -t custom-base:dev ./custom-base
```

You can then run this new image locally and play around with it:

```raw
$ docker run -it custom-base:dev /bin/bash
[root@2329458e5159 /]# cat /etc/redhat-release
CentOS Linux release 7.5.1804 (Core)
[root@2329458e5159 /]# rsync --version
rsync  version 3.1.2  protocol version 31
Copyright (C) 1996-2015 by Andrew Tridgell, Wayne Davison, and others.
Web site: http://rsync.samba.org/
Capabilities:
    64-bit files, 64-bit inums, 64-bit timestamps, 64-bit long ints,
    socketpairs, hardlinks, symlinks, IPv6, batchfiles, inplace,
    append, ACLs, xattrs, iconv, symtimes, prealloc

rsync comes with ABSOLUTELY NO WARRANTY.  This is free software, and you
are welcome to redistribute it under certain conditions.  See the GNU
General Public Licence for details.
```

Once everything is fine, you can create the Docker build in OpenShift:

```sh
oc new-build -D - --name=custom-base --image-stream=rh-base:7.5 --to=custom-base:7.5 < custom-base/Dockerfile
```

OpenShift has created the build config and started a new build. Follow the
build progression with:

```sh
oc logs -f bc/custom-base
```

Did you notice at the very beginning of the build log how OpenShift replaced
the `FROM centos:latest` with the correct image stream reference ?

```raw
Step 1/4 : FROM registry.access.redhat.com/rhel7@sha256:135cbbec4581cd8b2f550dd90dea06affb55def73c7421e64091dc3f638d05e4
```

Now, create a dummy container based on this new image:

```sh
oc new-app --name custom-base --image-stream=custom-base:7.5
oc patch dc custom-base --type=json -p '[{"op": "add", "path": "/spec/template/spec/containers/0/command", "value": ["/bin/sh", "-c", "while :; do sleep 1; done" ]}]'
```

Watch the container being created:

```sh
oc get pods -w -l app=custom-base
```

Once created, get a shell and play around with it:

```raw
$ oc rsh $(oc get pods -l app=custom-base -o name|tail -n 1)
sh-4.2$ cat /etc/redhat-release
Red Hat Enterprise Linux Server release 7.5 (Maipo)
sh-4.2$ rsync --version
rsync  version 3.1.2  protocol version 31
Copyright (C) 1996-2015 by Andrew Tridgell, Wayne Davison, and others.
Web site: http://rsync.samba.org/
Capabilities:
    64-bit files, 64-bit inums, 64-bit timestamps, 64-bit long ints,
    socketpairs, hardlinks, symlinks, IPv6, batchfiles, inplace,
    append, ACLs, xattrs, iconv, symtimes, prealloc

rsync comes with ABSOLUTELY NO WARRANTY.  This is free software, and you
are welcome to redistribute it under certain conditions.  See the GNU
General Public Licence for details.
```

Although everything went smoothly, there is a catch in this setup: the
[Docker layer cache](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/#leverage-build-cache).
If you run this build several times, you can see that subsequent builds
are much faster.

```raw
$ oc get builds
NAME             TYPE      FROM         STATUS                       STARTED         DURATION
custom-base-1    Docker    Dockerfile   Complete                     1 hours ago     3m53s
custom-base-2    Docker    Dockerfile   Complete                     3 minutes ago   6s
```

This might seems a good point but if a new security patch is released for
the `rsync` package we installed, it cannot be installed by triggering a new
build.

There is a settings to enable to prevent this behavior:

```sh
oc patch bc custom-base -p '{ "spec": { "strategy": { "dockerStrategy": { "noCache": true } } } }'
```

You can trigger a new build and check that the layer cache is not used anymore:

```sh
oc start-build custom-base
```

The new build does not use the layer caching mechanism:

```raw
$ oc get builds
NAME             TYPE      FROM         STATUS                       STARTED         DURATION
custom-base-1    Docker    Dockerfile   Complete                     1 hours ago     3m53s
custom-base-2    Docker    Dockerfile   Complete                     15 minutes ago  6s
custom-base-3    Docker    Dockerfile   Complete                     4 minutes ago   3m37s
```

## Create the second Docker build that builds the middleware image

In this example, we will build an image containing [tomcat](https://tomcat.apache.org/).

Start by reviewing the [Dockerfile](custom-tomcat/Dockerfile) of our middleware
image and try to build it locally:

```sh
docker build -t custom-tomcat:dev ./custom-tomcat --build-arg TOMCAT_URL=https://archive.apache.org/dist/tomcat/tomcat-9/v9.0.8/bin/apache-tomcat-9.0.8.tar.gz
```

You can then run this new image locally:

```sh
docker run --name tomcat -d -p 8080:8080 custom-tomcat:dev run
docker logs -f tomcat
```

And make sure tomcat is working properly:

```raw
$ curl -s http://localhost:8080/ |head -n 20



<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <title>Apache Tomcat/9.0.8</title>
        <link href="favicon.ico" rel="icon" type="image/x-icon" />
        <link href="favicon.ico" rel="shortcut icon" type="image/x-icon" />
        <link href="tomcat.css" rel="stylesheet" type="text/css" />
    </head>

    <body>
        <div id="wrapper">
            <div id="navigation" class="curved container">
                <span id="nav-home"><a href="http://tomcat.apache.org/">Home</a></span>
                <span id="nav-hosts"><a href="/docs/">Documentation</a></span>
                <span id="nav-config"><a href="/docs/config/">Configuration</a></span>
                <span id="nav-examples"><a href="/examples/">Examples</a></span>
```

Once everything is fine, you can create the Docker build in OpenShift:

```sh
oc new-build -D - --name=custom-tomcat --image-stream=custom-base:7.5 --to=custom-tomcat:9.0.8 --build-arg=TOMCAT_URL=https://archive.apache.org/dist/tomcat/tomcat-9/v9.0.8/bin/apache-tomcat-9.0.8.tar.gz < custom-tomcat/Dockerfile
```

OpenShift has created the build config and started a new build. Follow the
build progression with:

```sh
oc logs -f bc/custom-tomcat
```

You can then tag this image as "production":

```sh
oc tag custom-tomcat:9.0.8 custom-tomcat:production
```

Now, deploy a tomcat container based on this new image:

```sh
oc new-app --name custom-tomcat --image-stream=custom-tomcat:production
oc expose svc/custom-tomcat
```

Watch the container being created:

```sh
oc get pods -w -l app=custom-tomcat
```

Make sure your tomcat is working properly:

```sh
curl -s  http://$(oc get route custom-tomcat -o 'jsonpath={.spec.host}')/ |head -n 20
```

As with the previous example, it might be a good idea to disable the layer
caching mechanism with:

```sh
oc patch bc custom-tomcat -p '{ "spec": { "strategy": { "dockerStrategy": { "noCache": true } } } }'
```

## Create the third Docker build that builds the target application

In this example, we will build an image containing the [tomcat sample app](https://tomcat.apache.org/tomcat-7.0-doc/appdev/sample/).

Start by reviewing the [Dockerfile](target-app/Dockerfile) of our target app
image and try to build it locally:

```sh
docker build -t target-app:dev ./target-app --build-arg ARTIFACT_URL=https://tomcat.apache.org/tomcat-7.0-doc/appdev/sample/sample.war
```

You can then run this new image locally:

```sh
docker run --name tomcat -d -p 8080:8080 target-app:dev run
docker logs -f tomcat
```

And make sure the target application is working properly:

```raw
$ curl -s http://localhost:8080/my-sample-app/ |head -n 10
<html>
<head>
<title>Sample "Hello, World" Application</title>
</head>
<body bgcolor=white>

<table border="0">
<tr>
<td>
<img src="images/tomcat.gif">
```

Once everything is fine, you can create the Docker build in OpenShift:

```sh
oc new-build -D - --name=target-app --image-stream=custom-tomcat:production --to=target-app:latest --build-arg=ARTIFACT_URL=https://tomcat.apache.org/tomcat-7.0-doc/appdev/sample/sample.war < target-app/Dockerfile
```

As with the previous example, it might be a good idea to disable the layer
caching mechanism with:

```sh
oc patch bc target-app -p '{ "spec": { "strategy": { "dockerStrategy": { "noCache": true } } } }'
```

OpenShift has created the build config and started a new build. Follow the
build progression with:

```sh
oc logs -f bc/target-app
```

Now, deploy your application:

```sh
oc new-app --name target-app --image-stream=target-app:latest
oc expose svc/target-app
```

Make sure your target application is working properly:

```sh
curl -s  http://$(oc get route target-app -o 'jsonpath={.spec.host}')/ |head -n 20
```

Congratulation ! You successfully deployed your application !

## Update the middleware image

Now, let's say that a new version of tomcat has been released and you want
to build this new version. To do so, we need to:

- update the target imagestream reference (change the tag from `9.0.8` to `9.0.10`)
- update the build arg `TOMCAT_URL` with the correct url for this version
- start a new build
- tag the new image as "production"

Let's implement those modifications:

```sh
oc patch bc custom-tomcat --type=json -p '[ { "op": "replace", "path": "/spec/output/to/name", "value": "custom-tomcat:9.0.10" }, { "op": "replace", "path": "/spec/strategy/dockerStrategy/buildArgs/0/value", "value": "https://archive.apache.org/dist/tomcat/tomcat-9/v9.0.10/bin/apache-tomcat-9.0.10.tar.gz" } ]'
```

And trigger a new build with:

```sh
oc start-build custom-tomcat
oc logs -f bc/custom-tomcat
```

Tag the new version as "production" and watch OpenShift doing his magic:

```sh
oc tag custom-tomcat:9.0.10 custom-tomcat:production
oc get pods -w
```

You should get a similar output to this:

```raw
target-app-2-build       0/1       Init:0/1           0         1s
target-app-2-build       0/1       PodInitializing    0         5s
target-app-2-build       1/1       Running            0         6s
target-app-2-build       0/1       Completed          0         11s
target-app-2-deploy      0/1       Pending            0         0s
target-app-2-deploy      0/1       ContainerCreating  0         0s
target-app-2-deploy      1/1       Running            0         4s
target-app-2-6qrt8       0/1       Pending            0         0s
target-app-2-6qrt8       0/1       ContainerCreating  0         0s
target-app-2-6qrt8       1/1       Running            0         7s
target-app-1-bj9tg       1/1       Terminating        0         8m
target-app-1-bj9tg       0/1       Terminating        0         8m
target-app-2-deploy      0/1       Completed          0         16s
target-app-2-deploy      0/1       Terminating        0         16s
```

We could translate this OpenShift lingua to a similar monologue:

- _Oh ! The `custom-tomcat:production` image changed !_
- _So, I need to trigger the `target-app` build that depends on this image._

_[The `target-app` build finished.]_

- _Oh ! The `target-app:latest` image changed !_
- _So, I need to trigger a new deployment of the `target-app`_

And finally, your target app is deployed automatically on the new tomcat image.

## Commit your Dockerfile to a GIT repository

As you noticed, for each build we defined, the Dockerfile is stored inline in
the OpenShift BuildConfig object. This is a convenience during prototyping but
once your build is steady, you should commit the file to a GIT repository and
reference it from the build config.

Update the three buildconfig to reference this GIT repository instead:

```sh
oc patch bc custom-base --type=json -p '[ { "op": "replace", "path": "/spec/source", "value": { "type": "Dockerfile", "git": { "uri": "https://github.com/nmasse-itix/OpenShift-Examples.git", "ref": "master" }, "contextDir": "Docker-Builds/custom-base/" } } ]'
oc patch bc custom-tomcat --type=json -p '[ { "op": "replace", "path": "/spec/source", "value": { "type": "Dockerfile", "git": { "uri": "https://github.com/nmasse-itix/OpenShift-Examples.git", "ref": "master" }, "contextDir": "Docker-Builds/custom-tomcat/" } } ]'
oc patch bc target-app --type=json -p '[ { "op": "replace", "path": "/spec/source", "value": { "type": "Dockerfile", "git": { "uri": "https://github.com/nmasse-itix/OpenShift-Examples.git", "ref": "master" }, "contextDir": "Docker-Builds/target-app/" } } ]'
```

## Conclusion

In this guide we went through a real world example involving three chained
builds to defined a custom applicative stack and a target application.

We also saw how OpenShift re-builds any image and re-deploy any application
that depends on this image when this image changes.
