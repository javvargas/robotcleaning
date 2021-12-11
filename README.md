# client_robotcleaning

The back-end should simulate a robot cleaning a map.

## Features
- input: map

a long ASCII character string:
“ “ - empty spaces where robot can drive through
“#” - walls
“\n” - a new line of the map
every space is reachable
the height and width of the maze can vary, but is always be a rectangle

- robot algorithm

it can start in any position of your choice
can only move one space at time, every 200 ms
it cannot go past walls
clean all empty spaces
stop moving when all spaces are cleaned

```sh
npm start
```
