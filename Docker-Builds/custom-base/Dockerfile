FROM centos:latest

# Update the system, install rsync and cleanup the yum metadata
RUN yum -y update \
 && yum -y install rsync \
 && yum clean all \
 && rm -rf /var/cache/yum
