#!/bin/bash

destCsvFileName=./serverless/assets/dialTargets.private.csv

echo
echo "Please enter the numbersTwimlMap CSV file name."
echo "Include path relative to current directory."
echo
echo "Current directory:" $PWD
echo "CSV file name:"

read sourceCsvFileName

echo
echo "Copying $sourceCsvFileName to $destCsvFileName"
cp $sourceCsvFileName $destCsvFileName

echo
echo "Checking which Twilio CLI profile is active"
echo

twilio profiles:list

echo
echo "Is the right target profile active? (Y or N)"

read response

isCorrectProfile=$(tr "[:upper:]" "[:lower:]" <<< "$response")

if [ "$isCorrectProfile" = "y" ]
  then
    echo
    echo "Deploying Twilio serverless functions and assets"
    (cd ./serverless && twilio serverless:deploy)

    echo
    echo "Deploy script finished"
    echo
  else
    echo
    echo "Please activate the correct Twilio profile with"
    echo "'twilio profiles:use [ID]' and run this script again."
    echo
fi
    
