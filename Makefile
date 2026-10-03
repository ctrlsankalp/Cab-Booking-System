CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall

TARGET = cab_app.exe
SRCS = main.cpp cab_management.cpp real_map_logic.cpp
OBJS = $(SRCS:.cpp=.o)

all: $(TARGET)

$(TARGET): $(SRCS)
	$(CXX) $(CXXFLAGS) -o $(TARGET) $(SRCS)

run: $(TARGET)
	./$(TARGET)

clean:
	rm -f $(TARGET) *.o

.PHONY: all run clean
