# How to debug issues in OpenShift

## Context

Lets say that you deployed an application in OpenShift and the application is not working.
You would like to debug but the application does not embed any troubleshooting tool (for instance, an Alpine Linux or a scratch image)

Two approaches are possible:

- download statically compiled tools in the `/tmp` of the container
- add a side-car container with the required tools

## Static tools

You could download one of the [static tools available there](https://github.com/andrew-d/static-binaries)
in `/tmp` and run it from there.

## Sidecar container

For instance, if you need to troubleshoot network issues:

**Deploy our boggus application**

```sh
oc new-app --name boggus alpine:latest
oc patch dc boggus --type=json -p '[{"op": "add", "path": "/spec/template/spec/containers/0/command", "value": ["/bin/sh", "-c", "while :; do sleep 1; done" ]}]'
```

**Add a sidecar container that has the tools to debug network issues**

```sh
oc patch dc boggus --type=json -p '[{"op": "add", "path": "/spec/template/spec/containers/1", "value": { "image": "szalek/pentest-tools", "name": "debug", "command": [ "/bin/sh", "-c", "while :; do sleep 1; done" ]} }]'
```

**Enter the sidecar container**
```sh
oc rsh -c debug $(oc get pods -l app=boggus -o name|tail -n 1)
```

For strace, it is a bit more complicated since you will have access to the host PID namespace.

**Give privileged rights to the default service account**
```sh
oc adm policy add-scc-to-user privileged -z default
```

**Add a sidecar container that has strace**

```sh
oc patch dc boggus --type=json -p '[{"op": "add", "path": "/spec/template/spec/containers/1", "value": { "image": "benhall/strace-ubuntu", "name": "debug", "command": [ "/bin/sh", "-c", "while :; do sleep 1; done" ], "securityContext": { "privileged": true } } }, {"op": "add", "path": "/spec/template/spec/hostPID", "value": true } ]'
```

**Enter the sidecar container**

```sh
oc rsh -c debug $(oc get pods -l app=boggus -o name|tail -n 1)
```

**In the container, try:**

```sh
ps ax
```

**and then:**
```sh
strace -ff -p <pid>
```

## Debug a Build Job

Let's say that a Java build is failing and you need to troubleshoot the issue.
For the record, let's pretend it's a Java build based on maven. For instance,
you are trying to build [openshift-tasks](https://github.com/lbroudoux/openshift-tasks/tree/eap-7)
application.

Spawn a persistent Build Pod and get a shell on this pod:

```sh
oc new-app --name java-debug redhat-openjdk18-openshift:1.2
oc patch dc java-debug --type=json -p '[{"op": "add", "path": "/spec/template/spec/containers/0/command", "value": ["/bin/sh", "-c", "while :; do sleep 1; done" ]}]'
oc get pods
oc rsh $(oc get pods -l app=java-debug -o name|tail -n 1)
```

Since the Maven has been installed in the container using the Software
Collections, you will need to enable this environment with:

```sh
scl -l
scl enable rh-maven33 /bin/bash
```

The source code is usually fetched using GIT but from another container.
So, to fetch the source code to build, you can do a `git clone` and pack it from
another machine or if you are using GitHub, you can directly fetch a ZIP:

```sh
curl -Lo /tmp/src.zip https://github.com/lbroudoux/openshift-tasks/zipball/eap-7
```

Unpack it:

```sh
mkdir -p /tmp/src
cd /tmp/src
unzip /tmp/src.zip
```

And then, replicate what the S2I build is doing:

```sh
cd lbroudoux-openshift-tasks-d745675
/usr/local/s2i/assemble
```
