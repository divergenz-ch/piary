#!/bin/sh
# A stand-in test run: a few lines of output, a second apart.
for t in parses renders saves; do
	sleep 1
	echo "ok - $t"
done
echo "3 passed"
