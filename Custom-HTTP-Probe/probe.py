#!/usr/bin/python

import sys
import httplib
from urlparse import urlparse

if len (sys.argv) != 2 :
    print "Usage: probe.py url"
    sys.exit(1)

url = sys.argv[1]
print("Checking " + url + "...")

components = urlparse(url)

connection = httplib.HTTPConnection(components.netloc, timeout = 5)
connection.request("GET", components.path)
response = connection.getresponse()

status = response.status
content_type = response.getheader('Content-Type', "")
response.read()
connection.close()

if status == 418 and content_type.startswith('application/json') :
    print("OK")
    sys.exit(0)
else :
    print("KO " + str(status) + " " + content_type)
    sys.exit(1)
