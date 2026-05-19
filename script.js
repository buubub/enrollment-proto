const { createApp, ref, computed, watch, onMounted } = Vue;

createApp({
    setup() {
        const selectedCategory = ref('all');
        const selectedSemester = ref('');
        const selectedSubject = ref('');
        const selectedClass = ref('');

        const isLoading = ref(true);
        const error = ref(null);

        const subjects = ref([]);

        const enrollments = ref([]);

        const completedCourses = ref([
            { id: 1, code: 'TF0000', name: 'Pengantar Teknologi Informasi', grade: 'A', subjectId: 0 }, // Added subjectId for matching
            { id: 2, code: 'ENGL001', name: 'English for Academic Purposes', grade: 'B+', subjectId: null }
        ]);

        const failedCourses = ref([]);

        const loadSubjects = async () => {
            try {
                isLoading.value = true;
                const response = await fetch('data.json');
                if (!response.ok) {
                    throw new Error('Failed to load subjects data');
                }
                const data = await response.json();
                subjects.value = data.subjects;
                error.value = null;
            } catch (err) {
                error.value = err.message;
                console.error('Error loading subjects:', err);
            } finally {
                isLoading.value = false;
            }
        };

        onMounted(() => {
            loadSubjects();
        });

        // Get completed subject IDs for prerequisite checking
        const completedSubjectIds = computed(() => {
            // Map completed courses to subject IDs based on code matching
            const ids = [];
            completedCourses.value.forEach(course => {
                // Try to find matching subject by code
                const matchingSubject = subjects.value.find(s => s.code === course.code);
                if (matchingSubject) {
                    ids.push(matchingSubject.id);
                }
                if (course.subjectId) {
                    ids.push(course.subjectId);
                }
            });
            return ids;
        });

        // Check if prerequisites are met for a subject
        const arePrerequisitesMet = (subject) => {
            if (!subject.prerequisites || subject.prerequisites.length === 0) {
                return true; // No prerequisites means always met
            }

            // Check if all prerequisite IDs are in completed courses
            return subject.prerequisites.every(prereqId =>
                completedSubjectIds.value.includes(prereqId)
            );
        };

        // Get unmet prerequisites list
        const getUnmetPrerequisites = (subject) => {
            if (!subject.prerequisites || subject.prerequisites.length === 0) {
                return [];
            }

            return subject.prerequisites.filter(prereqId =>
                !completedSubjectIds.value.includes(prereqId)
            );
        };

        // Get prerequisite status for display
        const getPrerequisiteStatus = (subject) => {
            if (!subject.prerequisites || subject.prerequisites.length === 0) {
                return { met: true, text: 'None', unmetList: [] };
            }

            const met = arePrerequisitesMet(subject);
            const unmetList = getUnmetPrerequisites(subject);

            const prereqNames = subject.prerequisites.map(prereqId => {
                const prereqSubject = subjects.value.find(s => s.id === prereqId);
                return prereqSubject ? `${prereqSubject.code} - ${prereqSubject.name}` : `ID: ${prereqId}`;
            });

            return {
                met: met,
                text: prereqNames.join(', '),
                unmetList: unmetList,
                unmetNames: unmetList.map(prereqId => {
                    const prereqSubject = subjects.value.find(s => s.id === prereqId);
                    return prereqSubject ? `${prereqSubject.code} - ${prereqSubject.name}` : `ID: ${prereqId}`;
                })
            };
        };

        const categoryFilteredSubjects = computed(() => {
            let filtered = subjects.value;

            if (selectedCategory.value !== 'all') {
                filtered = filtered.filter(s => s.category === selectedCategory.value);
            }

            return filtered;
        });

        const uniqueSemesters = computed(() => {
            const semesters = new Set();
            categoryFilteredSubjects.value.forEach(subject => {
                semesters.add(subject.semester);
            });
            return Array.from(semesters).sort((a, b) => a - b);
        });

        const filteredSubjects = computed(() => {
            let filtered = categoryFilteredSubjects.value;

            if (selectedSemester.value) {
                filtered = filtered.filter(s => s.semester === parseInt(selectedSemester.value));
            }

            return filtered;
        });

        const selectedSubjectDetails = computed(() => {
            if (!selectedSubject.value) return null;
            return subjects.value.find(s => s.id === parseInt(selectedSubject.value));
        });

        const selectedClassDetails = computed(() => {
            if (!selectedClass.value || !selectedSubjectDetails.value) return null;
            return selectedSubjectDetails.value.classes.find(c => c.id === parseInt(selectedClass.value));
        });

        const selectedClassName = computed(() => {
            return selectedClassDetails.value ? selectedClassDetails.value.name : null;
        });

        // Check if selected subject meets prerequisites
        const doesSelectedSubjectMeetPrerequisites = computed(() => {
            if (!selectedSubjectDetails.value) return true;
            return arePrerequisitesMet(selectedSubjectDetails.value);
        });

        // Get prerequisite status for selected subject
        const selectedSubjectPrerequisiteStatus = computed(() => {
            if (!selectedSubjectDetails.value) return { met: true, text: 'None', unmetList: [], unmetNames: [] };
            return getPrerequisiteStatus(selectedSubjectDetails.value);
        });

        const getPrerequisitesText = (subject) => {
            if (!subject.prerequisites || subject.prerequisites.length === 0) {
                return 'None';
            }
            const prereqNames = subject.prerequisites.map(prereqId => {
                const prereqSubject = subjects.value.find(s => s.id === prereqId);
                return prereqSubject ? `${prereqSubject.code} - ${prereqSubject.name}` : `ID: ${prereqId}`;
            });
            return prereqNames.join(', ');
        };

        const isSubjectEnrolled = (subjectId) => {
            return enrollments.value.some(item => item.subjectId === subjectId);
        };

        const totalCredits = computed(() => {
            return enrollments.value.reduce((total, item) => total + item.credits, 0);
        });

        const addToEnrollment = () => {
            if (!selectedSemester.value) {
                alert('Please select a semester');
                return;
            }
            if (!selectedSubject.value) {
                alert('Please select a subject');
                return;
            }
            if (!selectedClass.value) {
                alert('Please select a class');
                return;
            }

            const subject = selectedSubjectDetails.value;
            const classItem = selectedClassDetails.value;

            // Check prerequisites before adding
            if (!arePrerequisitesMet(subject)) {
                const prereqStatus = getPrerequisiteStatus(subject);
                alert(`⚠️ Cannot enroll in ${subject.code} - ${subject.name}\n\nYou have not met the prerequisite(s):\n${prereqStatus.unmetNames.join('\n')}\n\nPlease complete these courses first.`);
                return;
            }

            if (isSubjectEnrolled(subject.id)) {
                alert(`${subject.code} - ${subject.name} is already in your enrollment cart.`);
                return;
            }

            const enrollmentItem = {
                id: Date.now(),
                subjectId: subject.id,
                code: subject.code,
                name: subject.name,
                semester: selectedSemester.value,
                credits: subject.credits,
                policy: subject.policy,
                className: classItem.name,
                schedules: classItem.schedules,
                addedAt: new Date().toLocaleString()
            };

            enrollments.value.push(enrollmentItem);

            selectedSubject.value = '';
            selectedClass.value = '';

            alert(`✅ Added: ${subject.code} - ${subject.name} (${classItem.name})`);
        };

        // Validate subject selection (when picking from dropdown)
        const validateSubjectSelection = () => {
            if (!selectedSubjectDetails.value) return;

            const subject = selectedSubjectDetails.value;

            if (!arePrerequisitesMet(subject)) {
                const prereqStatus = getPrerequisiteStatus(subject);
                alert(`⚠️ Prerequisite Warning\n\n${subject.code} - ${subject.name}\n\nMissing prerequisites:\n${prereqStatus.unmetNames.join('\n')}\n\nYou can still select this subject, but you won't be able to enroll until prerequisites are met.`);
            }

            // Reset class selection when subject changes
            selectedClass.value = '';
        };

        const removeFromEnrollment = (itemId) => {
            const item = enrollments.value.find(i => i.id === itemId);
            if (item && confirm(`Remove ${item.code} - ${item.name} from enrollment?`)) {
                enrollments.value = enrollments.value.filter(i => i.id !== itemId);
            }
        };

        const clearEnrollments = () => {
            if (enrollments.value.length > 0 && confirm('Clear all items from enrollment summary?')) {
                enrollments.value = [];
            }
        };

        const validateEnrollments = () => {
            if (enrollments.value.length === 0) {
                alert('No items in enrollment cart to validate.');
                return;
            }

            let message = `✅ Validation Summary\n\n`;
            message += `Total Items: ${enrollments.value.length}\n`;
            message += `Total Credits: ${totalCredits.value}\n\n`;
            message += `Enrolled Subjects:\n`;
            message += `─────────────────\n`;

            enrollments.value.forEach((item, index) => {
                message += `${index + 1}. ${item.code} - ${item.name}\n`;
                message += `   Class: ${item.className} | Semester: ${item.semester}\n`;
                message += `   Policy: ${item.policy}\n`;
            });

            alert(message);
        };

        const submitAllEnrollments = () => {
            if (enrollments.value.length === 0) {
                alert('No items in enrollment cart.');
                return;
            }

            // Check prerequisites for all items before submission
            const invalidItems = [];
            enrollments.value.forEach(item => {
                const subject = subjects.value.find(s => s.id === item.subjectId);
                if (subject && !arePrerequisitesMet(subject)) {
                    invalidItems.push(`${item.code} - ${item.name}`);
                }
            });

            if (invalidItems.length > 0) {
                alert(`❌ Cannot submit enrollment!\n\nThe following subjects have unmet prerequisites:\n${invalidItems.join('\n')}\n\nPlease remove them and complete prerequisites first.`);
                return;
            }

            alert(`✅ Successfully enrolled in ${enrollments.value.length} subject(s)!\n\nTotal Credits: ${totalCredits.value}`);
            // Optionally clear after submission
            // enrollments.value = [];
        };

        const resetFormSteps = () => {
            selectedSemester.value = '';
            selectedSubject.value = '';
            selectedClass.value = '';
        };

        const onSemesterChange = () => {
            selectedSubject.value = '';
            selectedClass.value = '';
        };

        const onSubjectChange = () => {
            selectedClass.value = '';
            validateSubjectSelection(); // Validate when subject changes
        };

        watch(selectedCategory, () => {
            resetFormSteps();
        });

        watch(selectedSemester, (newValue, oldValue) => {
            if (newValue !== oldValue && newValue) {
                onSemesterChange();
            }
        });

        return {
            subjects,
            completedCourses,
            failedCourses,
            selectedCategory,
            selectedSemester,
            selectedSubject,
            selectedClass,
            isLoading,
            error,
            enrollments,
            totalCredits,

            uniqueSemesters,
            filteredSubjects,
            selectedSubjectDetails,
            selectedClassName,
            isSubjectEnrolled,
            getPrerequisitesText,
            doesSelectedSubjectMeetPrerequisites,
            selectedSubjectPrerequisiteStatus,
            arePrerequisitesMet,

            onSubjectChange,
            onSemesterChange,
            addToEnrollment,
            removeFromEnrollment,
            clearEnrollments,
            validateEnrollments,
            submitAllEnrollments,
            validateSubjectSelection
        };
    }
}).mount('#app');
